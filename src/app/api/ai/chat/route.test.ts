import { APICallError } from "ai";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSupabaseStub,
  type ProgrammedResponse,
  type SupabaseStub,
} from "@/lib/actions/test-stubs";
import { checkAIRateLimit, resetAIRateLimit } from "@/lib/ai/rate-limit";
import { CONVERSATION_ID, MILK_ITEM_ID, USER_ID } from "@/lib/ai/test-fixtures";
import type {
  AIChatResponse,
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
} from "@/lib/v2/types";

import { POST } from "./route";

/* ─── Module mocks ────────────────────────────────────────────────────────── */

let stub: SupabaseStub;
let providers: AIProvider[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => stub.client,
}));

vi.mock("@/lib/ai/registry", () => ({
  buildProviderChain: () => providers,
}));

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

const PROPOSAL_ID = "88888888-8888-4888-8888-888888888888";
const PRODUCT_ID = "55555555-5555-4555-8555-555555555555";

function fakeProvider(
  id: string,
  behave: (request: AICompletionRequest) => Promise<AICompletionResponse>,
) {
  const calls: AICompletionRequest[] = [];
  const canonicalSnapshots: string[] = [];
  const provider: AIProvider = {
    id,
    displayName: id,
    complete: async (request) => {
      calls.push(request);
      canonicalSnapshots.push(JSON.stringify(request.messages));
      return behave(request);
    },
  };
  return { provider, calls, canonicalSnapshots };
}

function rateLimited(): APICallError {
  return new APICallError({
    message: "rate limited",
    url: "https://vendor.example",
    requestBodyValues: {},
    statusCode: 429,
    isRetryable: true,
  });
}

const TEXT_RESPONSE: AICompletionResponse = {
  parts: [{ type: "text", text: "Try a quick shakshuka!" }],
};

function conversationRow() {
  return {
    id: CONVERSATION_ID,
    title: "What can I cook?",
    created_at: "2026-08-18T10:00:00.000Z",
    updated_at: "2026-08-18T10:00:00.000Z",
  };
}

function messageRow(seq: number, role: string, parts: unknown) {
  return {
    id: `66666666-6666-4666-8666-${String(seq).padStart(12, "0")}`,
    conversation_id: CONVERSATION_ID,
    role,
    parts,
    seq,
    created_at: "2026-08-18T10:00:00.000Z",
  };
}

const FRIDGE_ROWS = [
  {
    id: MILK_ITEM_ID,
    user_id: USER_ID,
    product_id: PRODUCT_ID,
    remaining_percent: 100,
    added_at: "2026-08-01T10:00:00.000Z",
    finished_at: null,
    updated_at: "2026-08-01T10:00:00.000Z",
    restocked_from_item_id: null,
    product: {
      id: PRODUCT_ID,
      barcode: null,
      name: "Milk",
      brand: "Tnuva",
      package_size: "1L",
      category: "Dairy",
      image_url: null,
      source: "catalog",
    },
  },
];

/**
 * Responses for one successful NEW-conversation turn, in execution order:
 * create conversation → history → (seq read + user insert) → fridge →
 * [proposal insert] → (seq read + assistant insert) → touch.
 */
function happyTurnResponses(options: {
  assistantParts: unknown;
  proposalRows?: unknown[];
}): ProgrammedResponse[] {
  return [
    {
      table: "ai_conversations",
      op: "insert",
      result: { data: conversationRow() },
    },
    { table: "ai_messages", op: "select", result: { data: [] } },
    { table: "ai_messages", op: "select", result: { data: [] } },
    {
      table: "ai_messages",
      op: "insert",
      result: {
        data: messageRow(0, "user", [
          { type: "text", text: "What can I cook?" },
        ]),
      },
    },
    { table: "fridge_items", op: "select", result: { data: FRIDGE_ROWS } },
    ...(options.proposalRows
      ? [
          {
            table: "ai_action_proposals",
            op: "insert" as const,
            result: { data: options.proposalRows },
          },
        ]
      : []),
    { table: "ai_messages", op: "select", result: { data: [{ seq: 0 }] } },
    {
      table: "ai_messages",
      op: "insert",
      result: { data: messageRow(1, "assistant", options.assistantParts) },
    },
    { table: "ai_conversations", op: "update", result: { data: null } },
  ];
}

function authed(responses: ProgrammedResponse[] = []) {
  stub = createSupabaseStub({ user: { id: USER_ID }, responses });
}

function post(body: unknown, headers: Record<string, string> = {}) {
  const request = new Request("http://localhost/api/ai/chat", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
  return POST(request as unknown as NextRequest);
}

function fridgeWrites() {
  return stub.calls.filter(
    (call) => call.table === "fridge_items" && call.op !== "select",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAIRateLimit();
  providers = [];
  authed();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/* ─── Guards ──────────────────────────────────────────────────────────────── */

describe("POST /api/ai/chat guards", () => {
  it("returns 401 for anonymous callers", async () => {
    stub = createSupabaseStub({ user: null });
    const response = await post({ message: "hi" });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("unauthenticated");
  });

  it("returns 400 for a non-JSON body", async () => {
    const response = await post("{nope");
    expect(response.status).toBe(400);
  });

  it("returns 400 for schema-invalid bodies", async () => {
    expect((await post({ message: "   " })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect(
      (await post({ conversationId: "not-a-uuid", message: "hi" })).status,
    ).toBe(400);
  });

  it("returns 400 for oversized request bodies", async () => {
    const response = await post(
      { message: "hi" },
      { "content-length": "999999" },
    );
    expect(response.status).toBe(400);
  });

  it("rate limits after 10 turns per minute with Retry-After", async () => {
    for (let i = 0; i < 10; i += 1) checkAIRateLimit(USER_ID);
    const response = await post({ message: "hi" });
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(stub.calls).toHaveLength(0);
  });

  it("returns 400 for a foreign/unknown conversation id", async () => {
    authed([
      { table: "ai_conversations", op: "select", result: { data: null } },
    ]);
    providers = [fakeProvider("google", async () => TEXT_RESPONSE).provider];

    const response = await post({
      conversationId: CONVERSATION_ID,
      message: "hi",
    });

    expect(response.status).toBe(400);
    expect(
      stub.calls.filter(
        (call) => call.table === "ai_messages" && call.op === "insert",
      ),
    ).toHaveLength(0);
  });
});

/* ─── Turns ───────────────────────────────────────────────────────────────── */

describe("POST /api/ai/chat turns", () => {
  it("persists user + assistant messages and never writes the fridge", async () => {
    authed(
      happyTurnResponses({
        assistantParts: [{ type: "text", text: "Try a quick shakshuka!" }],
      }),
    );
    const google = fakeProvider("google", async () => TEXT_RESPONSE);
    providers = [google.provider];

    const response = await post({ message: "What can I cook?" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as AIChatResponse;

    expect(body.status).toBe("ok");
    if (body.status !== "ok") return;
    expect(body.conversationId).toBe(CONVERSATION_ID);
    expect(body.message.role).toBe("assistant");
    expect(body.message.parts).toEqual([
      { type: "text", text: "Try a quick shakshuka!" },
    ]);
    expect(body.proposals).toEqual([]);

    // Canonical writes: conversation, user message, assistant message.
    const convInsert = stub.calls.find(
      (call) => call.table === "ai_conversations" && call.op === "insert",
    );
    expect(convInsert?.values).toEqual({
      user_id: USER_ID,
      title: "What can I cook?",
    });
    const messageInserts = stub.calls.filter(
      (call) => call.table === "ai_messages" && call.op === "insert",
    );
    expect(messageInserts).toHaveLength(2);
    expect(messageInserts[0].values).toMatchObject({
      role: "user",
      seq: 0,
      parts: [{ type: "text", text: "What can I cook?" }],
    });
    expect(messageInserts[1].values).toMatchObject({
      role: "assistant",
      seq: 1,
      parts: [{ type: "text", text: "Try a quick shakshuka!" }],
    });

    // The chat turn may never mutate fridge rows.
    expect(fridgeWrites()).toHaveLength(0);

    // The provider saw ONLY the safe ref-based projection of the fridge.
    expect(google.calls).toHaveLength(1);
    expect(google.calls[0].inventory).toEqual([
      {
        ref: "item_1",
        name: "Milk",
        brand: "Tnuva",
        packageSize: "1L",
        category: "Dairy",
        remainingPercent: 100,
      },
    ]);
    const inventoryWire = JSON.stringify(google.calls[0].inventory);
    expect(inventoryWire).not.toContain(MILK_ITEM_ID);
    expect(inventoryWire).not.toContain(USER_ID);
    expect(inventoryWire).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it("falls back to the next provider and replays identical history", async () => {
    authed(
      happyTurnResponses({
        assistantParts: [{ type: "text", text: "Try a quick shakshuka!" }],
      }),
    );
    const google = fakeProvider("google", async () => {
      throw rateLimited();
    });
    const groq = fakeProvider("groq", async () => TEXT_RESPONSE);
    providers = [google.provider, groq.provider];

    const response = await post({ message: "What can I cook?" });
    const body = (await response.json()) as AIChatResponse;

    expect(body.status).toBe("ok");
    expect(google.calls).toHaveLength(1);
    expect(groq.calls).toHaveLength(1);
    // The SAME canonical context and snapshot reached both vendors.
    expect(google.canonicalSnapshots[0]).toBe(groq.canonicalSnapshots[0]);
    expect(google.calls[0].inventory).toEqual(groq.calls[0].inventory);
  });

  it("reports provider_unavailable when every provider fails transiently", async () => {
    authed(
      happyTurnResponses({ assistantParts: [] }), // assistant insert unused
    );
    const google = fakeProvider("google", async () => {
      throw rateLimited();
    });
    const groq = fakeProvider("groq", async () => {
      throw new TypeError("fetch failed");
    });
    providers = [google.provider, groq.provider];

    const response = await post({ message: "What can I cook?" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as AIChatResponse;

    expect(body).toMatchObject({
      status: "failed",
      conversationId: CONVERSATION_ID,
      error: { code: "provider_unavailable" },
    });

    // The user's message survived the outage; nothing else was written.
    const messageInserts = stub.calls.filter(
      (call) => call.table === "ai_messages" && call.op === "insert",
    );
    expect(messageInserts).toHaveLength(1);
    expect(messageInserts[0].values).toMatchObject({ role: "user" });
    expect(fridgeWrites()).toHaveLength(0);
  });

  it("does not fail over on application bugs — reports internal instead", async () => {
    authed(happyTurnResponses({ assistantParts: [] }));
    const google = fakeProvider("google", async () => {
      throw new TypeError("Cannot read properties of undefined");
    });
    const groq = fakeProvider("groq", async () => TEXT_RESPONSE);
    providers = [google.provider, groq.provider];

    const response = await post({ message: "What can I cook?" });
    const body = (await response.json()) as AIChatResponse;

    expect(body).toMatchObject({
      status: "failed",
      error: { code: "internal" },
    });
    expect(groq.calls).toHaveLength(0);
  });

  it("persists pending proposals and links them into the assistant message", async () => {
    const proposalRow = {
      id: PROPOSAL_ID,
      conversation_id: CONVERSATION_ID,
      user_id: USER_ID,
      kind: "add_item",
      payload: { name: "Onions", category: "Vegetables", units: 1 },
      status: "pending",
      created_at: "2026-08-18T10:00:00.000Z",
      updated_at: "2026-08-18T10:00:00.000Z",
    };
    authed(
      happyTurnResponses({
        assistantParts: [
          { type: "text", text: "Shall I add onions?" },
          {
            type: "action_proposal",
            proposalId: PROPOSAL_ID,
            kind: "add_item",
          },
        ],
        proposalRows: [proposalRow],
      }),
    );
    providers = [
      fakeProvider("google", async () => ({
        parts: [{ type: "text", text: "Shall I add onions?" }],
        proposals: [
          {
            kind: "add_item",
            payload: { name: "Onions", category: "Vegetables", units: 1 },
          },
        ],
      })).provider,
    ];

    const response = await post({ message: "I also have onions" });
    const body = (await response.json()) as AIChatResponse;

    expect(body.status).toBe("ok");
    if (body.status !== "ok") return;
    expect(body.proposals).toHaveLength(1);
    expect(body.proposals[0]).toMatchObject({
      id: PROPOSAL_ID,
      kind: "add_item",
      status: "pending",
    });

    const proposalInsert = stub.calls.find(
      (call) => call.table === "ai_action_proposals" && call.op === "insert",
    );
    expect(proposalInsert?.values).toEqual([
      {
        conversation_id: CONVERSATION_ID,
        user_id: USER_ID,
        kind: "add_item",
        payload: { name: "Onions", category: "Vegetables", units: 1 },
        status: "pending",
      },
    ]);

    // The assistant message carries the action_proposal part.
    const assistantInsert = stub.calls
      .filter((call) => call.table === "ai_messages" && call.op === "insert")
      .at(-1);
    expect(assistantInsert?.values).toMatchObject({
      parts: [
        { type: "text", text: "Shall I add onions?" },
        { type: "action_proposal", proposalId: PROPOSAL_ID, kind: "add_item" },
      ],
    });

    // Proposals never touch the fridge until accepted.
    expect(fridgeWrites()).toHaveLength(0);
  });

  it("rejects a turn when the conversation hit the message cap", async () => {
    const fullHistory = Array.from({ length: 200 }, (_, i) =>
      messageRow(i, i % 2 === 0 ? "user" : "assistant", [
        { type: "text", text: `m${i}` },
      ]),
    );
    authed([
      {
        table: "ai_conversations",
        op: "select",
        result: { data: conversationRow() },
      },
      { table: "ai_messages", op: "select", result: { data: fullHistory } },
    ]);
    providers = [fakeProvider("google", async () => TEXT_RESPONSE).provider];

    const response = await post({
      conversationId: CONVERSATION_ID,
      message: "one more?",
    });

    expect(response.status).toBe(400);
    expect(
      stub.calls.filter(
        (call) => call.table === "ai_messages" && call.op === "insert",
      ),
    ).toHaveLength(0);
  });

  it("never exposes provider API keys in any response", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "sk-google-super-secret");
    vi.stubEnv("GROQ_API_KEY", "gsk-groq-super-secret");

    authed(happyTurnResponses({ assistantParts: [] }));
    providers = [
      fakeProvider("google", async () => {
        throw rateLimited();
      }).provider,
    ];

    const failed = await post({ message: "What can I cook?" });
    const failedText = JSON.stringify(await failed.json());
    expect(failedText).not.toContain("sk-google-super-secret");
    expect(failedText).not.toContain("gsk-groq-super-secret");

    authed(
      happyTurnResponses({
        assistantParts: [{ type: "text", text: "Try a quick shakshuka!" }],
      }),
    );
    providers = [fakeProvider("google", async () => TEXT_RESPONSE).provider];
    const ok = await post({ message: "What can I cook?" });
    const okText = JSON.stringify(await ok.json());
    expect(okText).not.toContain("sk-google-super-secret");
    expect(okText).not.toContain("gsk-groq-super-secret");
  });
});
