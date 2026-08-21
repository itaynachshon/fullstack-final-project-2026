/**
 * One chat turn, end to end (called by POST /api/ai/chat after auth + Zod):
 *
 *   1. load (or create) the caller's conversation        — RLS-scoped
 *   2. reconstruct canonical provider-neutral history    — ai_messages.parts
 *   3. persist the user message                          — append-only
 *   4. take ONE privacy-filtered fridge snapshot; providers receive only
 *      the safe ref-based projection (the ref → id map stays here)
 *   5. run the provider chain (primary → fallback on transient failures,
 *      replaying the SAME canonical context and the SAME refs)
 *   6. resolve the drafted refs back to database ids, then persist pending
 *      proposals + the assistant message
 *
 * No fridge mutation happens anywhere on this path — proposals are stored
 * as `pending` and applied only by the explicit accept actions in
 * src/lib/v2/actions/ai.ts.
 *
 * Provider outages surface as `{ status: "failed", provider_unavailable }`
 * (HTTP 200) per the frozen contract — never a raw vendor 5xx.
 */

import { aiMessagePartsSchema } from "@/lib/v2/schemas";
import type {
  AIChatRequest,
  AIChatResponse,
  AICompletionRequest,
  AIMessagePart,
} from "@/lib/v2/types";

import { AI_LIMITS, resolveAIConfig } from "./config";
import {
  appendMessage,
  createConversation,
  deriveConversationTitle,
  getConversationSummary,
  insertProposals,
  loadMessages,
  touchConversation,
  type DbClient,
} from "./conversation";
import {
  AIConfigError,
  ProviderChainExhaustedError,
  ProviderFatalError,
} from "./errors";
import { runWithProviderFallback } from "./failover";
import { loadFridgeUnitsForAI } from "./inventory";
import { buildProviderChain } from "./registry";
import { resolveCompletionParts, resolveCompletionProposals } from "./resolve";
import { buildTurnInventory, toInventoryUnits } from "./snapshot";
import type { StoredProposalDraft } from "./types";

/** Unknown or foreign conversation id — the route answers 400. */
export class ConversationNotFoundError extends Error {
  constructor() {
    super("Conversation not found.");
    this.name = "ConversationNotFoundError";
  }
}

/** Turn cap reached — history is kept; the user starts a new chat. */
export class ConversationFullError extends Error {
  constructor() {
    super("This conversation is full — start a new chat.");
    this.name = "ConversationFullError";
  }
}

export interface ChatTurnParams {
  db: DbClient;
  userId: string;
  request: AIChatRequest;
  /** Aborts provider work when the HTTP request is cancelled. */
  signal?: AbortSignal;
}

export async function runChatTurn(
  params: ChatTurnParams,
): Promise<AIChatResponse> {
  const { db, userId, request, signal } = params;

  // 1. Conversation (RLS hides foreign rows → indistinguishable not-found).
  const conversation = request.conversationId
    ? await getConversationSummary(db, request.conversationId)
    : await createConversation(
        db,
        userId,
        deriveConversationTitle(request.message),
      );
  if (!conversation) throw new ConversationNotFoundError();

  // 2. Canonical history + size gate (full history stays persisted forever;
  //    only the outbound context window is bounded).
  const history = await loadMessages(db, conversation.id);
  if (history.length >= AI_LIMITS.maxConversationMessages) {
    throw new ConversationFullError();
  }

  // 3. Persist the user message before any provider is contacted, so the
  //    turn is never lost to a vendor outage.
  const userMessage = await appendMessage(db, conversation.id, "user", [
    { type: "text", text: request.message },
  ]);

  // 4. One snapshot per turn. The ref → database-id map (inventory) never
  //    leaves this function; providers get only the safe projection.
  const inventory = buildTurnInventory(await loadFridgeUnitsForAI(db));

  const completionRequest: AICompletionRequest = {
    conversationId: conversation.id,
    messages: [...history, userMessage],
    inventory: toInventoryUnits(inventory),
    userMessage: request.message,
  };

  // 5. Provider chain.
  let outcome;
  try {
    const config = resolveAIConfig();
    const providers = buildProviderChain(config);
    outcome = await runWithProviderFallback({
      providers,
      request: completionRequest,
      timeoutMs: config.providerTimeoutMs,
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof ProviderChainExhaustedError) {
      console.error("AI provider chain exhausted:", error.message);
      return {
        status: "failed",
        conversationId: conversation.id,
        error: {
          code: "provider_unavailable",
          message:
            "The assistant is temporarily unavailable — please try again in a moment.",
        },
      };
    }
    if (error instanceof ProviderFatalError || error instanceof AIConfigError) {
      console.error("AI turn failed (non-transient):", error);
      return {
        status: "failed",
        conversationId: conversation.id,
        error: {
          code: "internal",
          message: "Something went wrong on our side — try again.",
        },
      };
    }
    throw error;
  }

  // Diagnostic only: which vendor served the turn (never persisted into the
  // provider-neutral message format).
  if (outcome.attempts.length > 0) {
    console.warn(
      `AI turn served by "${outcome.providerId}" after failover ` +
        `(${outcome.attempts.map((a) => `${a.providerId}: ${a.message}`).join("; ")}).`,
    );
  }

  // 6. Resolve the drafted refs against the SAME snapshot they were minted
  //    from, then persist. A resolution failure is an application bug (tools
  //    validate refs), so it surfaces as `internal` — never as an outage.
  let resolvedParts: AIMessagePart[];
  let proposalDrafts: StoredProposalDraft[];
  try {
    resolvedParts = resolveCompletionParts(outcome.response.parts, inventory);
    proposalDrafts = resolveCompletionProposals(
      (outcome.response.proposals ?? []).slice(
        0,
        AI_LIMITS.maxProposalsPerTurn,
      ),
      inventory,
    );
  } catch (error) {
    console.error("AI draft resolution failed:", error);
    return {
      status: "failed",
      conversationId: conversation.id,
      error: {
        code: "internal",
        message: "Something went wrong on our side — try again.",
      },
    };
  }

  const proposals = await insertProposals(
    db,
    conversation.id,
    userId,
    proposalDrafts,
  );

  const parts: AIMessagePart[] = [
    ...resolvedParts,
    ...proposals.map((proposal): AIMessagePart => ({
      type: "action_proposal",
      proposalId: proposal.id,
      kind: proposal.kind,
    })),
  ];

  const validParts = aiMessagePartsSchema.safeParse(parts);
  if (!validParts.success) {
    console.error(
      "Assistant parts failed frozen validation:",
      validParts.error,
    );
    return {
      status: "failed",
      conversationId: conversation.id,
      error: {
        code: "internal",
        message: "Something went wrong on our side — try again.",
      },
    };
  }

  const assistantMessage = await appendMessage(
    db,
    conversation.id,
    "assistant",
    validParts.data,
  );
  await touchConversation(db, conversation.id);

  return {
    status: "ok",
    conversationId: conversation.id,
    message: assistantMessage,
    proposals,
  };
}
