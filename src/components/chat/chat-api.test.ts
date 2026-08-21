import { describe, expect, it, vi } from "vitest";

import type { AIChatResponse } from "@/lib/v2/types";

import { CHAT_ENDPOINT, postChatMessage } from "./chat-api";
import { assistantTextMessage, pendingAddProposal } from "./test-fixtures";

/** Minimal Response-like stub for the injected fetch. */
function jsonResponse(
  status: number,
  payload: unknown,
  headers: Record<string, string> = {},
) {
  return {
    status,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    json: () => Promise.resolve(payload),
  };
}

describe("postChatMessage outcome classification", () => {
  it("POSTs the frozen request shape to /api/ai/chat", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: {} }));
    await postChatMessage(
      { conversationId: "11111111-1111-4111-8111-111111111111", message: "hi" },
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: "11111111-1111-4111-8111-111111111111",
        message: "hi",
      }),
    });
  });

  it("classifies a successful turn with message and proposals", async () => {
    const message = assistantTextMessage("Here's an idea.");
    const proposal = pendingAddProposal();
    const payload: AIChatResponse = {
      status: "ok",
      conversationId: message.conversationId,
      message,
      proposals: [proposal],
    };
    const outcome = await postChatMessage({ message: "hi" }, async () =>
      jsonResponse(200, payload),
    );

    expect(outcome).toEqual({
      kind: "ok",
      conversationId: message.conversationId,
      message,
      proposals: [proposal],
    });
  });

  it("maps a failed turn to turn_failed with the provider_unavailable code", async () => {
    const payload: AIChatResponse = {
      status: "failed",
      conversationId: "22222222-2222-4222-8222-222222222222",
      error: { code: "provider_unavailable", message: "unavailable" },
    };
    const outcome = await postChatMessage({ message: "hi" }, async () =>
      jsonResponse(200, payload),
    );

    expect(outcome).toEqual({
      kind: "turn_failed",
      conversationId: "22222222-2222-4222-8222-222222222222",
      code: "provider_unavailable",
    });
  });

  it("maps an internal turn failure to turn_failed/internal", async () => {
    const payload: AIChatResponse = {
      status: "failed",
      conversationId: "22222222-2222-4222-8222-222222222222",
      error: { code: "internal", message: "bug" },
    };
    const outcome = await postChatMessage({ message: "hi" }, async () =>
      jsonResponse(200, payload),
    );

    expect(outcome).toMatchObject({ kind: "turn_failed", code: "internal" });
  });

  it("maps 429 to rate_limited and reads Retry-After", async () => {
    const outcome = await postChatMessage({ message: "hi" }, async () =>
      jsonResponse(429, { error: {} }, { "retry-after": "7" }),
    );

    expect(outcome).toEqual({ kind: "rate_limited", retryAfterSeconds: 7 });
  });

  it("tolerates a missing Retry-After header", async () => {
    const outcome = await postChatMessage({ message: "hi" }, async () =>
      jsonResponse(429, { error: {} }),
    );

    expect(outcome).toEqual({ kind: "rate_limited", retryAfterSeconds: null });
  });

  it("maps 400 to rejected and surfaces the server's message", async () => {
    const outcome = await postChatMessage({ message: "hi" }, async () =>
      jsonResponse(400, {
        error: { code: "invalid_request", message: "Invalid chat request." },
      }),
    );

    expect(outcome).toEqual({
      kind: "rejected",
      message: "Invalid chat request.",
    });
  });

  it("falls back to a generic message for a bodyless 400", async () => {
    const outcome = await postChatMessage({ message: "hi" }, async () =>
      jsonResponse(400, {}),
    );

    expect(outcome).toEqual({
      kind: "rejected",
      message: "That message couldn't be sent.",
    });
  });

  it("maps 401 to unauthenticated", async () => {
    const outcome = await postChatMessage({ message: "hi" }, async () =>
      jsonResponse(401, { error: {} }),
    );

    expect(outcome).toEqual({ kind: "unauthenticated" });
  });

  it("maps thrown fetches (offline) to request_failed", async () => {
    const outcome = await postChatMessage({ message: "hi" }, async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(outcome).toEqual({ kind: "request_failed" });
  });

  it("maps unexpected 5xx to request_failed", async () => {
    const outcome = await postChatMessage({ message: "hi" }, async () =>
      jsonResponse(500, { error: {} }),
    );

    expect(outcome).toEqual({ kind: "request_failed" });
  });

  it("maps an unreadable 200 body to request_failed", async () => {
    const outcome = await postChatMessage({ message: "hi" }, async () => ({
      status: 200,
      headers: { get: () => null },
      json: () => Promise.reject(new SyntaxError("bad json")),
    }));

    expect(outcome).toEqual({ kind: "request_failed" });
  });
});
