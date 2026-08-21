/**
 * Pure state transitions for the Fridge Assistant thread — no React, no I/O,
 * fully unit-testable. ChatScreen holds one `ChatThreadState` in `useState`
 * and applies these functions.
 *
 * Persistence model (mirrors the F3 orchestrator):
 * - `messages` are known-persisted rows: loaded from the server, or local
 *   echoes of user messages the contract guarantees were written (an `ok` or
 *   `turn_failed` chat response both mean the user message is in the DB).
 * - `pending` is the ONE in-flight user message (the route allows one turn
 *   at a time per submission; the composer is disabled while set).
 * - `turnError` marks "persisted but unanswered": retrying must NOT re-send
 *   the same text (it would duplicate the stored message) — the retry path
 *   sends the short RETRY_TURN_MESSAGE follow-up instead (see copy.ts).
 * - `composerNotice` marks "not (provably) persisted": the draft is restored
 *   to the composer and re-sending the same text is safe.
 */

import type {
  AIActionProposal,
  AIConversationDetail,
  AIMessage,
} from "@/lib/v2/types";

import type { ChatSendOutcome } from "./chat-api";
import { COPY } from "./copy";

export interface TurnError {
  code: "provider_unavailable" | "internal";
}

export interface ComposerNotice {
  kind: "rate_limited" | "rejected" | "request_failed" | "signed_out";
  message: string;
  /** Draft to restore into the composer; null when re-sending is pointless. */
  retryText: string | null;
}

export interface ChatThreadState {
  conversationId: string | null;
  messages: AIMessage[];
  proposals: Record<string, AIActionProposal>;
  /** Per-proposal inline hint (e.g. stale-fridge conflict guidance). */
  proposalNotices: Record<string, string>;
  /** Text of the in-flight user message, if a turn is running. */
  pending: string | null;
  turnError: TurnError | null;
  composerNotice: ComposerNotice | null;
}

export function emptyThreadState(): ChatThreadState {
  return {
    conversationId: null,
    messages: [],
    proposals: {},
    proposalNotices: {},
    pending: null,
    turnError: null,
    composerNotice: null,
  };
}

function proposalsById(
  proposals: AIActionProposal[],
): Record<string, AIActionProposal> {
  const map: Record<string, AIActionProposal> = {};
  for (const proposal of proposals) map[proposal.id] = proposal;
  return map;
}

/** Initial state for a reloaded persisted conversation. */
export function threadStateFromDetail(
  detail: AIConversationDetail,
): ChatThreadState {
  return {
    ...emptyThreadState(),
    conversationId: detail.id,
    messages: detail.messages,
    proposals: proposalsById(detail.proposals),
  };
}

/** A send begins: exactly one pending message; stale errors are cleared. */
export function startSend(
  state: ChatThreadState,
  text: string,
): ChatThreadState {
  return {
    ...state,
    pending: text,
    turnError: null,
    composerNotice: null,
  };
}

/**
 * Local echo of a user message the server confirmed persisting. `seq: -1`
 * marks it as a client-side echo (real seq arrives on the next full reload);
 * ids are local-only and never rendered.
 */
export function localUserEcho(
  text: string,
  localId: string,
  conversationId: string,
  createdAtIso: string,
): AIMessage {
  return {
    id: localId,
    conversationId,
    role: "user",
    parts: [{ type: "text", text }],
    seq: -1,
    createdAt: createdAtIso,
  };
}

export interface SendContext {
  localId: string;
  nowIso: string;
}

/** Applies a classified send outcome for the pending message. */
export function applySendOutcome(
  state: ChatThreadState,
  sentText: string,
  outcome: ChatSendOutcome,
  context: SendContext,
): ChatThreadState {
  const base: ChatThreadState = { ...state, pending: null };

  switch (outcome.kind) {
    case "ok":
      return {
        ...base,
        conversationId: outcome.conversationId,
        messages: [
          ...state.messages,
          localUserEcho(
            sentText,
            context.localId,
            outcome.conversationId,
            context.nowIso,
          ),
          outcome.message,
        ],
        proposals: {
          ...state.proposals,
          ...proposalsById(outcome.proposals),
        },
      };

    case "turn_failed":
      // The user message IS stored — show it as delivered, flag the turn.
      return {
        ...base,
        conversationId: outcome.conversationId,
        messages: [
          ...state.messages,
          localUserEcho(
            sentText,
            context.localId,
            outcome.conversationId,
            context.nowIso,
          ),
        ],
        turnError: { code: outcome.code },
      };

    case "rate_limited":
      return {
        ...base,
        composerNotice: {
          kind: "rate_limited",
          message: COPY.rateLimited,
          retryText: sentText,
        },
      };

    case "rejected":
      return {
        ...base,
        composerNotice: {
          kind: "rejected",
          message: outcome.message,
          retryText: null,
        },
      };

    case "unauthenticated":
      return {
        ...base,
        composerNotice: {
          kind: "signed_out",
          message: COPY.signedOut,
          retryText: null,
        },
      };

    case "request_failed":
      return {
        ...base,
        composerNotice: {
          kind: "request_failed",
          message: COPY.requestFailed,
          retryText: sentText,
        },
      };
  }
}

/**
 * Replaces thread content with server truth (conversation reload / conflict
 * refresh). A turn error is cleared when the server shows the conversation
 * was answered after all (e.g. another tab retried successfully).
 */
export function mergeDetail(
  state: ChatThreadState,
  detail: AIConversationDetail,
): ChatThreadState {
  const last = detail.messages.at(-1);
  const answered = last?.role === "assistant";
  return {
    ...state,
    conversationId: detail.id,
    messages: detail.messages,
    proposals: proposalsById(detail.proposals),
    turnError: answered ? null : state.turnError,
  };
}

export function setProposalStatus(
  state: ChatThreadState,
  proposalId: string,
  status: AIActionProposal["status"],
): ChatThreadState {
  const proposal = state.proposals[proposalId];
  if (!proposal) return state;
  const notices = { ...state.proposalNotices };
  delete notices[proposalId];
  return {
    ...state,
    proposals: {
      ...state.proposals,
      [proposalId]: { ...proposal, status },
    },
    proposalNotices: notices,
  };
}

export function setProposalNotice(
  state: ChatThreadState,
  proposalId: string,
  notice: string,
): ChatThreadState {
  return {
    ...state,
    proposalNotices: { ...state.proposalNotices, [proposalId]: notice },
  };
}

export function dismissComposerNotice(state: ChatThreadState): ChatThreadState {
  return { ...state, composerNotice: null };
}

/** Marks the thread as persisted-but-unanswered (reconciled network retry). */
export function setTurnError(
  state: ChatThreadState,
  code: TurnError["code"],
): ChatThreadState {
  return { ...state, turnError: { code }, composerNotice: null };
}

/**
 * After a `request_failed` send (persistence unknown), the refreshed
 * conversation tells us how to retry safely:
 * - "answered":              the request actually landed AND was answered —
 *                            merging the detail is the whole recovery.
 * - "persisted_unanswered":  the user message landed but no reply exists —
 *                            same situation as turn_failed (no blind resend).
 * - "not_persisted":         the request never landed — re-send the draft.
 */
export function classifyReconciledSend(
  detail: AIConversationDetail,
  sentText: string,
): "answered" | "persisted_unanswered" | "not_persisted" {
  let lastUserIndex = -1;
  for (let i = detail.messages.length - 1; i >= 0; i--) {
    if (detail.messages[i].role === "user") {
      lastUserIndex = i;
      break;
    }
  }
  if (lastUserIndex === -1) return "not_persisted";
  const lastUser = detail.messages[lastUserIndex];
  const text = lastUser.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n");
  if (text !== sentText) return "not_persisted";
  return lastUserIndex < detail.messages.length - 1
    ? "answered"
    : "persisted_unanswered";
}
