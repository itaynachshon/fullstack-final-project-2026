import { describe, expect, it } from "vitest";

import {
  createSupabaseStub,
  type ProgrammedResponse,
} from "@/lib/actions/test-stubs";
import type { AIMessagePart } from "@/lib/v2/types";

import {
  appendMessage,
  deriveConversationTitle,
  getConversationSummary,
  insertProposals,
  loadMessages,
  loadProposals,
  type DbClient,
} from "./conversation";
import { CONVERSATION_ID, USER_ID } from "./test-fixtures";

const TEXT_PARTS: AIMessagePart[] = [{ type: "text", text: "hi" }];

function db(responses: ProgrammedResponse[] = []) {
  const stub = createSupabaseStub({ user: { id: USER_ID }, responses });
  return { stub, client: stub.client as unknown as DbClient };
}

function messageRow(seq: number, parts: unknown = TEXT_PARTS) {
  return {
    id: `66666666-6666-4666-8666-${String(seq).padStart(12, "0")}`,
    conversation_id: CONVERSATION_ID,
    role: "user",
    parts,
    seq,
    created_at: "2026-08-10T10:00:00.000Z",
  };
}

describe("deriveConversationTitle", () => {
  it("collapses whitespace and truncates to the 80-char CHECK limit", () => {
    expect(deriveConversationTitle("  what   can I\n cook? ")).toBe(
      "what can I cook?",
    );
    const long = "x".repeat(200);
    const title = deriveConversationTitle(long);
    expect(title.length).toBe(80);
    expect(title.endsWith("…")).toBe(true);
    expect(deriveConversationTitle("   ")).toBe("New chat");
  });
});

describe("appendMessage", () => {
  it("writes the next seq after the current maximum", async () => {
    const { stub, client } = db([
      { table: "ai_messages", op: "select", result: { data: [{ seq: 3 }] } },
      {
        table: "ai_messages",
        op: "insert",
        result: { data: messageRow(4) },
      },
    ]);

    const message = await appendMessage(
      client,
      CONVERSATION_ID,
      "user",
      TEXT_PARTS,
    );

    expect(message.seq).toBe(4);
    const insert = stub.calls.find((call) => call.op === "insert");
    expect(insert?.values).toMatchObject({
      conversation_id: CONVERSATION_ID,
      role: "user",
      seq: 4,
    });
  });

  it("retries with a fresh seq when a concurrent writer wins the slot", async () => {
    const { stub, client } = db([
      { table: "ai_messages", op: "select", result: { data: [{ seq: 1 }] } },
      {
        table: "ai_messages",
        op: "insert",
        result: { error: { code: "23505", message: "duplicate" } },
      },
      { table: "ai_messages", op: "select", result: { data: [{ seq: 4 }] } },
      { table: "ai_messages", op: "insert", result: { data: messageRow(5) } },
    ]);

    const message = await appendMessage(
      client,
      CONVERSATION_ID,
      "user",
      TEXT_PARTS,
    );

    expect(message.seq).toBe(5);
    const inserts = stub.calls.filter((call) => call.op === "insert");
    expect(inserts).toHaveLength(2);
    expect(inserts[1].values).toMatchObject({ seq: 5 });
  });
});

describe("loadMessages", () => {
  it("drops rows whose stored parts fail the frozen schema", async () => {
    const { client } = db([
      {
        table: "ai_messages",
        op: "select",
        result: {
          data: [
            messageRow(0),
            messageRow(1, [{ type: "alien", boom: true }]),
            messageRow(2),
          ],
        },
      },
    ]);
    const messages = await loadMessages(client, CONVERSATION_ID);
    expect(messages.map((message) => message.seq)).toEqual([0, 2]);
  });
});

describe("proposals", () => {
  const validRow = {
    id: "88888888-8888-4888-8888-888888888888",
    conversation_id: CONVERSATION_ID,
    user_id: USER_ID,
    kind: "add_item",
    payload: { name: "Onions", category: "Vegetables", units: 2 },
    status: "pending",
    created_at: "2026-08-10T10:00:00.000Z",
    updated_at: "2026-08-10T10:00:00.000Z",
  };

  it("maps valid rows and skips corrupted payloads", async () => {
    const { client } = db([
      {
        table: "ai_action_proposals",
        op: "select",
        result: {
          data: [validRow, { ...validRow, id: "x", payload: { junk: 1 } }],
        },
      },
    ]);
    const proposals = await loadProposals(client, CONVERSATION_ID);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      kind: "add_item",
      status: "pending",
      payload: { name: "Onions", units: 2 },
    });
  });

  it("inserts drafts as pending rows owned by the caller", async () => {
    const { stub, client } = db([
      {
        table: "ai_action_proposals",
        op: "insert",
        result: { data: [validRow] },
      },
    ]);
    const inserted = await insertProposals(client, CONVERSATION_ID, USER_ID, [
      {
        kind: "add_item",
        payload: { name: "Onions", category: "Vegetables", units: 2 },
      },
    ]);
    expect(inserted).toHaveLength(1);
    const insert = stub.calls.find((call) => call.op === "insert");
    expect(insert?.values).toEqual([
      {
        conversation_id: CONVERSATION_ID,
        user_id: USER_ID,
        kind: "add_item",
        payload: { name: "Onions", category: "Vegetables", units: 2 },
        status: "pending",
      },
    ]);
  });

  it("returns nothing without touching the db for an empty draft list", async () => {
    const { stub, client } = db();
    expect(await insertProposals(client, CONVERSATION_ID, USER_ID, [])).toEqual(
      [],
    );
    expect(stub.calls).toHaveLength(0);
  });
});

describe("getConversationSummary", () => {
  it("returns null for foreign/unknown conversations (RLS invisibility)", async () => {
    const { client } = db([
      { table: "ai_conversations", op: "select", result: { data: null } },
    ]);
    expect(await getConversationSummary(client, CONVERSATION_ID)).toBeNull();
  });
});
