import { beforeEach, describe, expect, it, vi } from "vitest";

import { setRemaining } from "@/lib/actions/fridge";
import { createManualProduct } from "@/lib/actions/products";
import {
  createSupabaseStub,
  type ProgrammedResponse,
  type SupabaseStub,
} from "@/lib/actions/test-stubs";
import {
  CONVERSATION_ID,
  EGGS_ITEM_ID,
  MILK_ITEM_ID,
  SHAKSHUKA_RECIPE,
  USER_ID,
} from "@/lib/ai/test-fixtures";

import {
  acceptAIAddProposal,
  acceptAIConsumptionProposal,
  getAIConversation,
  listAIConversations,
  rejectAIProposal,
} from "./ai";

/* ─── Module mocks ────────────────────────────────────────────────────────── */

let stub: SupabaseStub;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => stub.client,
}));

vi.mock("@/lib/actions/fridge", () => ({ setRemaining: vi.fn() }));
vi.mock("@/lib/actions/products", () => ({ createManualProduct: vi.fn() }));

const setRemainingMock = vi.mocked(setRemaining);
const createManualProductMock = vi.mocked(createManualProduct);

const PROPOSAL_ID = "88888888-8888-4888-8888-888888888888";

const ADD_PAYLOAD = { name: "Onions", category: "Vegetables", units: 2 };

const CONSUME_PAYLOAD = {
  recipe: SHAKSHUKA_RECIPE,
  consumptions: [
    {
      itemId: MILK_ITEM_ID,
      productName: "Milk",
      fromPercent: 100,
      toPercent: 75,
    },
    {
      itemId: EGGS_ITEM_ID,
      productName: "Eggs",
      fromPercent: 75,
      toPercent: 50,
    },
  ],
};

function proposalRow(
  overrides: Partial<{
    kind: string;
    payload: unknown;
    status: string;
  }> = {},
) {
  return {
    id: PROPOSAL_ID,
    conversation_id: CONVERSATION_ID,
    user_id: USER_ID,
    kind: "add_item",
    payload: ADD_PAYLOAD,
    status: "pending",
    created_at: "2026-08-10T10:00:00.000Z",
    updated_at: "2026-08-10T10:00:00.000Z",
    ...overrides,
  };
}

function authed(responses: ProgrammedResponse[] = []) {
  stub = createSupabaseStub({ user: { id: USER_ID }, responses });
}

function anonymous() {
  stub = createSupabaseStub({ user: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  authed();
});

/* ─── Reads ───────────────────────────────────────────────────────────────── */

describe("listAIConversations", () => {
  it("requires authentication", async () => {
    anonymous();
    const result = await listAIConversations();
    expect(result).toMatchObject({
      ok: false,
      error: { code: "unauthenticated" },
    });
  });

  it("maps the caller's conversations", async () => {
    authed([
      {
        table: "ai_conversations",
        op: "select",
        result: {
          data: [
            {
              id: CONVERSATION_ID,
              title: "shakshuka",
              created_at: "2026-08-10T10:00:00.000Z",
              updated_at: "2026-08-10T11:00:00.000Z",
            },
          ],
        },
      },
    ]);
    const result = await listAIConversations();
    expect(result).toEqual({
      ok: true,
      data: [
        {
          id: CONVERSATION_ID,
          title: "shakshuka",
          createdAt: "2026-08-10T10:00:00.000Z",
          updatedAt: "2026-08-10T11:00:00.000Z",
        },
      ],
    });
  });
});

describe("getAIConversation", () => {
  it("validates the id shape", async () => {
    const result = await getAIConversation({ conversationId: "nope" });
    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(stub.calls).toHaveLength(0);
  });

  it("reports foreign/unknown conversations as not_found", async () => {
    authed([
      { table: "ai_conversations", op: "select", result: { data: null } },
    ]);
    const result = await getAIConversation({ conversationId: CONVERSATION_ID });
    expect(result).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("returns messages and proposals for an owned conversation", async () => {
    authed([
      {
        table: "ai_conversations",
        op: "select",
        result: {
          data: {
            id: CONVERSATION_ID,
            title: "shakshuka",
            created_at: "2026-08-10T10:00:00.000Z",
            updated_at: "2026-08-10T11:00:00.000Z",
          },
        },
      },
      {
        table: "ai_messages",
        op: "select",
        result: {
          data: [
            {
              id: "66666666-6666-4666-8666-000000000001",
              conversation_id: CONVERSATION_ID,
              role: "user",
              parts: [{ type: "text", text: "hi" }],
              seq: 0,
              created_at: "2026-08-10T10:00:00.000Z",
            },
          ],
        },
      },
      {
        table: "ai_action_proposals",
        op: "select",
        result: { data: [proposalRow()] },
      },
    ]);

    const result = await getAIConversation({ conversationId: CONVERSATION_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.messages).toHaveLength(1);
    expect(result.data.proposals[0]).toMatchObject({
      id: PROPOSAL_ID,
      kind: "add_item",
      status: "pending",
    });
  });
});

/* ─── Accept: add item ────────────────────────────────────────────────────── */

describe("acceptAIAddProposal", () => {
  it("requires authentication and a valid id", async () => {
    anonymous();
    expect(
      await acceptAIAddProposal({ proposalId: PROPOSAL_ID }),
    ).toMatchObject({ ok: false, error: { code: "unauthenticated" } });

    authed();
    expect(await acceptAIAddProposal({ proposalId: "nope" })).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(createManualProductMock).not.toHaveBeenCalled();
  });

  it("hides foreign proposals as not_found (cross-user forbidden)", async () => {
    authed([
      { table: "ai_action_proposals", op: "select", result: { data: null } },
    ]);
    const result = await acceptAIAddProposal({ proposalId: PROPOSAL_ID });
    expect(result).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(createManualProductMock).not.toHaveBeenCalled();
  });

  it("rejects the wrong proposal kind", async () => {
    authed([
      {
        table: "ai_action_proposals",
        op: "select",
        result: {
          data: proposalRow({
            kind: "consume_recipe",
            payload: CONSUME_PAYLOAD,
          }),
        },
      },
    ]);
    const result = await acceptAIAddProposal({ proposalId: PROPOSAL_ID });
    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
  });

  it("reports an already-resolved proposal as a conflict", async () => {
    authed([
      {
        table: "ai_action_proposals",
        op: "select",
        result: { data: proposalRow({ status: "accepted" }) },
      },
    ]);
    const result = await acceptAIAddProposal({ proposalId: PROPOSAL_ID });
    expect(result).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(createManualProductMock).not.toHaveBeenCalled();
  });

  it("applies the DB payload via createManualProduct after claiming", async () => {
    authed([
      {
        table: "ai_action_proposals",
        op: "select",
        result: { data: proposalRow() },
      },
      {
        table: "ai_action_proposals",
        op: "update",
        result: { data: [{ id: PROPOSAL_ID }] },
      },
    ]);
    createManualProductMock.mockResolvedValue({
      ok: true,
      data: {
        product: {
          id: "99999999-9999-4999-8999-999999999999",
          barcode: null,
          name: "Onions",
          brand: null,
          packageSize: null,
          category: "Vegetables",
          imageUrl: null,
          source: "user",
        },
        existed: false,
        itemIds: ["fi-1", "fi-2"],
      },
    });

    const result = await acceptAIAddProposal({ proposalId: PROPOSAL_ID });

    expect(result).toEqual({
      ok: true,
      data: { proposalId: PROPOSAL_ID, itemIds: ["fi-1", "fi-2"] },
    });
    // Payload came from the database row, not from anything client-sent.
    expect(createManualProductMock).toHaveBeenCalledWith({
      name: "Onions",
      barcode: undefined,
      brand: undefined,
      packageSize: undefined,
      category: "Vegetables",
      addUnits: 2,
    });
    const claim = stub.calls.find((call) => call.op === "update");
    expect(claim?.values).toMatchObject({ status: "accepted" });
    expect(claim?.eq).toEqual({ id: PROPOSAL_ID, status: "pending" });
  });

  it("treats a lost claim race as a conflict without mutating", async () => {
    authed([
      {
        table: "ai_action_proposals",
        op: "select",
        result: { data: proposalRow() },
      },
      { table: "ai_action_proposals", op: "update", result: { data: [] } },
    ]);
    const result = await acceptAIAddProposal({ proposalId: PROPOSAL_ID });
    expect(result).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(createManualProductMock).not.toHaveBeenCalled();
  });

  it("reverts the claim when the fridge mutation fails", async () => {
    authed([
      {
        table: "ai_action_proposals",
        op: "select",
        result: { data: proposalRow() },
      },
      {
        table: "ai_action_proposals",
        op: "update",
        result: { data: [{ id: PROPOSAL_ID }] },
      },
      { table: "ai_action_proposals", op: "update", result: { data: [] } },
    ]);
    createManualProductMock.mockResolvedValue({
      ok: false,
      error: { code: "internal", message: "db down" },
    });

    const result = await acceptAIAddProposal({ proposalId: PROPOSAL_ID });

    expect(result).toMatchObject({ ok: false, error: { code: "internal" } });
    const updates = stub.calls.filter((call) => call.op === "update");
    expect(updates).toHaveLength(2);
    expect(updates[1].values).toMatchObject({ status: "pending" });
  });
});

/* ─── Accept: consumption ─────────────────────────────────────────────────── */

describe("acceptAIConsumptionProposal", () => {
  const consumeRow = () =>
    proposalRow({ kind: "consume_recipe", payload: CONSUME_PAYLOAD });

  it("rejects the wrong kind", async () => {
    authed([
      {
        table: "ai_action_proposals",
        op: "select",
        result: { data: proposalRow() },
      },
    ]);
    const result = await acceptAIConsumptionProposal({
      proposalId: PROPOSAL_ID,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
  });

  it("validates current levels then applies via setRemaining", async () => {
    authed([
      {
        table: "ai_action_proposals",
        op: "select",
        result: { data: consumeRow() },
      },
      {
        table: "ai_action_proposals",
        op: "update",
        result: { data: [{ id: PROPOSAL_ID }] },
      },
      {
        table: "fridge_items",
        op: "select",
        result: { data: { id: MILK_ITEM_ID, remaining_percent: 100 } },
      },
      {
        table: "fridge_items",
        op: "select",
        result: { data: { id: EGGS_ITEM_ID, remaining_percent: 75 } },
      },
    ]);
    setRemainingMock.mockImplementation(
      async ({ itemId, remainingPercent }) => ({
        ok: true,
        data: { itemId, remainingPercent, finished: remainingPercent === 0 },
      }),
    );

    const result = await acceptAIConsumptionProposal({
      proposalId: PROPOSAL_ID,
    });

    expect(result).toEqual({
      ok: true,
      data: { proposalId: PROPOSAL_ID, itemIds: [MILK_ITEM_ID, EGGS_ITEM_ID] },
    });
    expect(setRemainingMock).toHaveBeenNthCalledWith(1, {
      itemId: MILK_ITEM_ID,
      remainingPercent: 75,
    });
    expect(setRemainingMock).toHaveBeenNthCalledWith(2, {
      itemId: EGGS_ITEM_ID,
      remainingPercent: 50,
    });
    // No direct fridge_items writes from this action — only reads.
    expect(
      stub.calls.filter(
        (call) => call.table === "fridge_items" && call.op !== "select",
      ),
    ).toHaveLength(0);
  });

  it("refuses a stale proposal when the fridge changed", async () => {
    authed([
      {
        table: "ai_action_proposals",
        op: "select",
        result: { data: consumeRow() },
      },
      {
        table: "ai_action_proposals",
        op: "update",
        result: { data: [{ id: PROPOSAL_ID }] },
      },
      {
        table: "fridge_items",
        op: "select",
        result: { data: { id: MILK_ITEM_ID, remaining_percent: 50 } },
      },
      { table: "ai_action_proposals", op: "update", result: { data: [] } },
    ]);

    const result = await acceptAIConsumptionProposal({
      proposalId: PROPOSAL_ID,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(setRemainingMock).not.toHaveBeenCalled();
    const updates = stub.calls.filter((call) => call.op === "update");
    expect(updates[1].values).toMatchObject({ status: "pending" });
  });

  it("refuses when a referenced item no longer exists", async () => {
    authed([
      {
        table: "ai_action_proposals",
        op: "select",
        result: { data: consumeRow() },
      },
      {
        table: "ai_action_proposals",
        op: "update",
        result: { data: [{ id: PROPOSAL_ID }] },
      },
      { table: "fridge_items", op: "select", result: { data: null } },
      { table: "ai_action_proposals", op: "update", result: { data: [] } },
    ]);
    const result = await acceptAIConsumptionProposal({
      proposalId: PROPOSAL_ID,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(setRemainingMock).not.toHaveBeenCalled();
  });

  it("compensates applied items and reverts when a later apply fails", async () => {
    authed([
      {
        table: "ai_action_proposals",
        op: "select",
        result: { data: consumeRow() },
      },
      {
        table: "ai_action_proposals",
        op: "update",
        result: { data: [{ id: PROPOSAL_ID }] },
      },
      {
        table: "fridge_items",
        op: "select",
        result: { data: { id: MILK_ITEM_ID, remaining_percent: 100 } },
      },
      {
        table: "fridge_items",
        op: "select",
        result: { data: { id: EGGS_ITEM_ID, remaining_percent: 75 } },
      },
      { table: "ai_action_proposals", op: "update", result: { data: [] } },
    ]);
    setRemainingMock
      .mockResolvedValueOnce({
        ok: true,
        data: { itemId: MILK_ITEM_ID, remainingPercent: 75, finished: false },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "internal", message: "boom" },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { itemId: MILK_ITEM_ID, remainingPercent: 100, finished: false },
      });

    const result = await acceptAIConsumptionProposal({
      proposalId: PROPOSAL_ID,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "internal" } });
    // 1: apply milk, 2: fail eggs, 3: compensate milk back to 100.
    expect(setRemainingMock).toHaveBeenCalledTimes(3);
    expect(setRemainingMock).toHaveBeenNthCalledWith(3, {
      itemId: MILK_ITEM_ID,
      remainingPercent: 100,
    });
  });
});

/* ─── Reject ──────────────────────────────────────────────────────────────── */

describe("rejectAIProposal", () => {
  it("marks a pending proposal rejected without touching the fridge", async () => {
    authed([
      {
        table: "ai_action_proposals",
        op: "update",
        result: { data: [{ id: PROPOSAL_ID }] },
      },
    ]);
    const result = await rejectAIProposal({ proposalId: PROPOSAL_ID });
    expect(result).toEqual({
      ok: true,
      data: { proposalId: PROPOSAL_ID, status: "rejected" },
    });
    expect(setRemainingMock).not.toHaveBeenCalled();
    expect(createManualProductMock).not.toHaveBeenCalled();
    expect(
      stub.calls.filter((call) => call.table === "fridge_items"),
    ).toHaveLength(0);
  });

  it("distinguishes already-resolved (conflict) from unknown (not_found)", async () => {
    authed([
      { table: "ai_action_proposals", op: "update", result: { data: [] } },
      {
        table: "ai_action_proposals",
        op: "select",
        result: { data: proposalRow({ status: "accepted" }) },
      },
    ]);
    expect(await rejectAIProposal({ proposalId: PROPOSAL_ID })).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });

    authed([
      { table: "ai_action_proposals", op: "update", result: { data: [] } },
      { table: "ai_action_proposals", op: "select", result: { data: null } },
    ]);
    expect(await rejectAIProposal({ proposalId: PROPOSAL_ID })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });
});
