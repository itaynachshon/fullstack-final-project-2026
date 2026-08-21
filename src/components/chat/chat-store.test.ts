import { describe, expect, it } from "vitest";

import {
  applySendOutcome,
  classifyReconciledSend,
  dismissComposerNotice,
  emptyThreadState,
  localUserEcho,
  mergeDetail,
  setProposalNotice,
  setProposalStatus,
  setTurnError,
  startSend,
  threadStateFromDetail,
} from "./chat-store";
import { COPY } from "./copy";
import {
  ADD_PROPOSAL_ID,
  assistantTextMessage,
  CONVERSATION_ID,
  conversationDetail,
  pendingAddProposal,
  userTextMessage,
} from "./test-fixtures";

const CONTEXT = { localId: "local-1", nowIso: "2026-08-19T10:00:00.000Z" };

describe("thread initialization", () => {
  it("starts empty for a new conversation", () => {
    const state = emptyThreadState();
    expect(state.conversationId).toBeNull();
    expect(state.messages).toEqual([]);
    expect(state.pending).toBeNull();
    expect(state.turnError).toBeNull();
    expect(state.composerNotice).toBeNull();
  });

  it("hydrates messages and a proposal map from a persisted conversation", () => {
    const proposal = pendingAddProposal();
    const detail = conversationDetail({ proposals: [proposal] });
    const state = threadStateFromDetail(detail);

    expect(state.conversationId).toBe(CONVERSATION_ID);
    expect(state.messages).toHaveLength(2);
    expect(state.proposals[ADD_PROPOSAL_ID]).toEqual(proposal);
  });
});

describe("sending", () => {
  it("startSend sets the one pending slot and clears stale errors", () => {
    let state = emptyThreadState();
    state = { ...state, turnError: { code: "internal" } };
    state = startSend(state, "What can I cook?");

    expect(state.pending).toBe("What can I cook?");
    expect(state.turnError).toBeNull();
    expect(state.composerNotice).toBeNull();
  });

  it("a successful turn appends the user echo plus the assistant reply and merges proposals", () => {
    const reply = assistantTextMessage("Try shakshuka.");
    const proposal = pendingAddProposal();
    let state = startSend(emptyThreadState(), "hi");
    state = applySendOutcome(
      state,
      "hi",
      {
        kind: "ok",
        conversationId: CONVERSATION_ID,
        message: reply,
        proposals: [proposal],
      },
      CONTEXT,
    );

    expect(state.pending).toBeNull();
    expect(state.conversationId).toBe(CONVERSATION_ID);
    expect(state.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(state.messages[0].parts).toEqual([{ type: "text", text: "hi" }]);
    expect(state.proposals[ADD_PROPOSAL_ID]).toEqual(proposal);
  });

  it("a failed turn keeps the persisted user message and flags the turn — no resend text", () => {
    let state = startSend(emptyThreadState(), "hi");
    state = applySendOutcome(
      state,
      "hi",
      {
        kind: "turn_failed",
        conversationId: CONVERSATION_ID,
        code: "provider_unavailable",
      },
      CONTEXT,
    );

    // The message IS in the thread (it was persisted server-side)…
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe("user");
    // …and the error is a turn error, NOT a composer notice with retry text:
    // re-sending the same text would duplicate the stored message.
    expect(state.turnError).toEqual({ code: "provider_unavailable" });
    expect(state.composerNotice).toBeNull();
  });

  it("rate limiting keeps the draft out of the thread and offers a safe retry", () => {
    let state = startSend(emptyThreadState(), "hi");
    state = applySendOutcome(
      state,
      "hi",
      { kind: "rate_limited", retryAfterSeconds: 5 },
      CONTEXT,
    );

    expect(state.messages).toHaveLength(0);
    expect(state.composerNotice).toEqual({
      kind: "rate_limited",
      message: COPY.rateLimited,
      retryText: "hi",
    });
  });

  it("a rejected send surfaces the server message without a retry", () => {
    let state = startSend(emptyThreadState(), "hi");
    state = applySendOutcome(
      state,
      "hi",
      { kind: "rejected", message: "This conversation is full." },
      CONTEXT,
    );

    expect(state.messages).toHaveLength(0);
    expect(state.composerNotice).toEqual({
      kind: "rejected",
      message: "This conversation is full.",
      retryText: null,
    });
  });

  it("an expired session surfaces a sign-in notice", () => {
    let state = startSend(emptyThreadState(), "hi");
    state = applySendOutcome(state, "hi", { kind: "unauthenticated" }, CONTEXT);

    expect(state.composerNotice?.kind).toBe("signed_out");
  });

  it("a network failure keeps the draft retryable", () => {
    let state = startSend(emptyThreadState(), "hi");
    state = applySendOutcome(state, "hi", { kind: "request_failed" }, CONTEXT);

    expect(state.messages).toHaveLength(0);
    expect(state.composerNotice).toEqual({
      kind: "request_failed",
      message: COPY.requestFailed,
      retryText: "hi",
    });
  });

  it("marks local echoes so reloads can replace them", () => {
    const echo = localUserEcho(
      "hi",
      "local-9",
      CONVERSATION_ID,
      CONTEXT.nowIso,
    );
    expect(echo.seq).toBe(-1);
    expect(echo.role).toBe("user");
  });
});

describe("server-truth reconciliation", () => {
  it("mergeDetail replaces messages/proposals and clears an answered turn error", () => {
    let state = emptyThreadState();
    state = { ...state, turnError: { code: "provider_unavailable" } };
    const detail = conversationDetail(); // ends with an assistant message
    state = mergeDetail(state, detail);

    expect(state.messages).toHaveLength(2);
    expect(state.turnError).toBeNull();
  });

  it("mergeDetail keeps the turn error while the thread is still unanswered", () => {
    let state = emptyThreadState();
    state = { ...state, turnError: { code: "provider_unavailable" } };
    const detail = conversationDetail({
      messages: [userTextMessage("hello?")],
    });
    state = mergeDetail(state, detail);

    expect(state.turnError).toEqual({ code: "provider_unavailable" });
  });

  it("classifies a reconciled send against server truth", () => {
    const answered = conversationDetail({
      messages: [userTextMessage("send this"), assistantTextMessage("done")],
    });
    expect(classifyReconciledSend(answered, "send this")).toBe("answered");

    const unanswered = conversationDetail({
      messages: [userTextMessage("send this")],
    });
    expect(classifyReconciledSend(unanswered, "send this")).toBe(
      "persisted_unanswered",
    );

    const different = conversationDetail({
      messages: [userTextMessage("something else")],
    });
    expect(classifyReconciledSend(different, "send this")).toBe(
      "not_persisted",
    );

    const empty = conversationDetail({ messages: [] });
    expect(classifyReconciledSend(empty, "send this")).toBe("not_persisted");
  });

  it("setTurnError flags the thread and clears the composer notice", () => {
    let state = emptyThreadState();
    state = {
      ...state,
      composerNotice: {
        kind: "request_failed",
        message: "x",
        retryText: "y",
      },
    };
    state = setTurnError(state, "internal");

    expect(state.turnError).toEqual({ code: "internal" });
    expect(state.composerNotice).toBeNull();
  });
});

describe("proposal state", () => {
  it("updates a proposal status and drops its stale notice", () => {
    const proposal = pendingAddProposal();
    let state = threadStateFromDetail(
      conversationDetail({ proposals: [proposal] }),
    );
    state = setProposalNotice(state, ADD_PROPOSAL_ID, "fridge changed");
    state = setProposalStatus(state, ADD_PROPOSAL_ID, "accepted");

    expect(state.proposals[ADD_PROPOSAL_ID].status).toBe("accepted");
    expect(state.proposalNotices[ADD_PROPOSAL_ID]).toBeUndefined();
  });

  it("ignores status updates for unknown proposals", () => {
    const state = emptyThreadState();
    expect(setProposalStatus(state, "nope", "accepted")).toBe(state);
  });

  it("dismissComposerNotice clears only the notice", () => {
    let state = emptyThreadState();
    state = {
      ...state,
      composerNotice: { kind: "rate_limited", message: "x", retryText: "y" },
    };
    state = dismissComposerNotice(state);
    expect(state.composerNotice).toBeNull();
  });
});
