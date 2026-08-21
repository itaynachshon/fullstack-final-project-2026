/**
 * Fetch client for POST /api/ai/chat (the frozen F0/F3 contract).
 *
 * Every HTTP/network outcome is classified into a discriminated union the
 * chat store can act on. The critical distinction is whether the user's
 * message was PERSISTED server-side (F3 writes it before contacting any
 * provider — src/lib/ai/orchestrator.ts step 3):
 *
 *   - 200 `status:"ok"`      → persisted, answered.
 *   - 200 `status:"failed"`  → persisted, NOT answered (provider outage or
 *                              internal error after persistence). Retrying by
 *                              re-sending the same text would duplicate it.
 *   - 429 / 400 / 401        → rejected before persistence; safe to re-send.
 *   - network error / 5xx / malformed body → persistence UNKNOWN; the caller
 *     reconciles via getAIConversation before deciding how to retry.
 *
 * The route is non-streaming by contract; a plain fetch is sufficient.
 */

import type {
  AIActionProposal,
  AIChatRequest,
  AIChatResponse,
  AIMessage,
} from "@/lib/v2/types";

export type ChatSendOutcome =
  | {
      kind: "ok";
      conversationId: string;
      message: AIMessage;
      proposals: AIActionProposal[];
    }
  | {
      /** Persisted but unanswered — never blind-resend the same text. */
      kind: "turn_failed";
      conversationId: string;
      code: "provider_unavailable" | "internal";
    }
  | { kind: "rate_limited"; retryAfterSeconds: number | null }
  | {
      /** 400 — not persisted (invalid body, unknown/full conversation). */
      kind: "rejected";
      message: string;
    }
  | { kind: "unauthenticated" }
  | {
      /** Fetch threw, 5xx, or unreadable body — persistence unknown. */
      kind: "request_failed";
    };

export const CHAT_ENDPOINT = "/api/ai/chat";

type FetchLike = (
  input: string,
  init: RequestInit,
) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

export async function postChatMessage(
  body: AIChatRequest,
  fetchImpl: FetchLike = fetch,
): Promise<ChatSendOutcome> {
  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchImpl(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: "request_failed" };
  }

  if (response.status === 401) return { kind: "unauthenticated" };

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("Retry-After"));
    return {
      kind: "rate_limited",
      retryAfterSeconds:
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { kind: "request_failed" };
  }

  if (response.status === 400) {
    const message =
      typeof (payload as { error?: { message?: unknown } })?.error?.message ===
      "string"
        ? (payload as { error: { message: string } }).error.message
        : "That message couldn't be sent.";
    return { kind: "rejected", message };
  }

  if (response.status !== 200) return { kind: "request_failed" };

  const chat = payload as AIChatResponse;
  if (chat.status === "ok") {
    return {
      kind: "ok",
      conversationId: chat.conversationId,
      message: chat.message,
      proposals: chat.proposals,
    };
  }
  if (chat.status === "failed") {
    return {
      kind: "turn_failed",
      conversationId: chat.conversationId,
      code:
        chat.error.code === "provider_unavailable"
          ? "provider_unavailable"
          : "internal",
    };
  }
  return { kind: "request_failed" };
}
