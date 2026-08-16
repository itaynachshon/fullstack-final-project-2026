import { beforeEach, describe, expect, it, vi } from "vitest";

import { revalidatePath } from "next/cache";

import { addToFridge, deleteItem, restockItem, setRemaining } from "./fridge";
import {
  createSupabaseStub,
  type ProgrammedResponse,
  type SupabaseStub,
} from "./test-stubs";

/* ─── Module mocks ────────────────────────────────────────────────────────── */

let stub: SupabaseStub;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => stub.client,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
const ITEM_ID = "33333333-3333-4333-8333-333333333333";

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

/* ─── addToFridge ─────────────────────────────────────────────────────────── */

describe("addToFridge", () => {
  it("rejects unauthenticated callers before touching the database", async () => {
    anonymous();
    const result = await addToFridge({ productId: PRODUCT_ID, units: 1 });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "unauthenticated" }),
    });
    expect(stub.calls).toHaveLength(0);
  });

  it("validates against the frozen schema (units 1–20, uuid product)", async () => {
    const zero = await addToFridge({ productId: PRODUCT_ID, units: 0 });
    const many = await addToFridge({ productId: PRODUCT_ID, units: 21 });
    const badId = await addToFridge({ productId: "nope", units: 1 });

    for (const result of [zero, many, badId]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("validation");
    }
    expect(stub.calls).toHaveLength(0);
  });

  it("inserts one 100% row per physical unit, owned by the caller", async () => {
    authed([
      {
        table: "fridge_items",
        op: "insert",
        result: { data: [{ id: "a" }, { id: "b" }, { id: "c" }] },
      },
    ]);

    const result = await addToFridge({ productId: PRODUCT_ID, units: 3 });

    expect(result).toEqual({ ok: true, data: { itemIds: ["a", "b", "c"] } });
    const insert = stub.calls.find((call) => call.op === "insert");
    expect(insert?.values).toEqual([
      { user_id: USER_ID, product_id: PRODUCT_ID, remaining_percent: 100 },
      { user_id: USER_ID, product_id: PRODUCT_ID, remaining_percent: 100 },
      { user_id: USER_ID, product_id: PRODUCT_ID, remaining_percent: 100 },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/fridge");
    expect(revalidatePath).toHaveBeenCalledWith("/add");
  });

  it("reports a dangling product id as not_found, not a raw DB error", async () => {
    authed([
      {
        table: "fridge_items",
        op: "insert",
        result: { error: { code: "23503", message: "fk violation" } },
      },
    ]);

    const result = await addToFridge({ productId: PRODUCT_ID, units: 1 });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "not_found" }),
    });
  });
});

/* ─── setRemaining ────────────────────────────────────────────────────────── */

interface SetupOptions {
  current: number;
  finishedAt?: string | null;
}

function setupItem({ current, finishedAt = null }: SetupOptions) {
  authed([
    {
      table: "fridge_items",
      op: "select",
      result: {
        data: {
          id: ITEM_ID,
          remaining_percent: current,
          finished_at: finishedAt,
        },
      },
    },
    {
      table: "fridge_items",
      op: "update",
      result: { data: [{ id: ITEM_ID }] },
    },
    { table: "consumption_events", op: "insert", result: {} },
  ]);
}

function updateCall() {
  return stub.calls.find(
    (call) => call.table === "fridge_items" && call.op === "update",
  );
}

function eventCall() {
  return stub.calls.find(
    (call) => call.table === "consumption_events" && call.op === "insert",
  );
}

describe("setRemaining", () => {
  // Approved sign convention (docs/IMPLEMENTATION_PLAN.md §12): delta =
  // old − new, so consuming logs a POSITIVE delta (points consumed).
  it.each([
    { from: 100, to: 75 as const, delta: 25 },
    { from: 75, to: 50 as const, delta: 25 },
    { from: 50, to: 25 as const, delta: 25 },
    { from: 25, to: 0 as const, delta: 25 },
  ])(
    "$from → $to writes delta $delta with remaining_after $to",
    async ({ from, to, delta }) => {
      setupItem({ current: from });

      const result = await setRemaining({
        itemId: ITEM_ID,
        remainingPercent: to,
      });

      expect(result).toEqual({
        ok: true,
        data: { itemId: ITEM_ID, remainingPercent: to, finished: to === 0 },
      });
      expect(eventCall()?.values).toMatchObject({
        fridge_item_id: ITEM_ID,
        user_id: USER_ID,
        delta_percent: delta,
        remaining_after: to,
      });
    },
  );

  it("stamps finished_at when the unit hits zero", async () => {
    setupItem({ current: 25 });

    await setRemaining({ itemId: ITEM_ID, remainingPercent: 0 });

    const update = updateCall()?.values as Record<string, unknown>;
    expect(update.remaining_percent).toBe(0);
    expect(typeof update.finished_at).toBe("string");
  });

  it("clears finished_at on an upward correction from zero (0 → 50)", async () => {
    setupItem({ current: 0, finishedAt: "2026-08-10T00:00:00Z" });

    const result = await setRemaining({
      itemId: ITEM_ID,
      remainingPercent: 50,
    });

    expect(result).toEqual({
      ok: true,
      data: { itemId: ITEM_ID, remainingPercent: 50, finished: false },
    });
    const update = updateCall()?.values as Record<string, unknown>;
    expect(update.remaining_percent).toBe(50);
    expect(update.finished_at).toBeNull();
    // Upward correction = negative delta (a restoration event, plan §12).
    expect(eventCall()?.values).toMatchObject({
      delta_percent: -50,
      remaining_after: 50,
    });
  });

  it("re-tapping the current level is a successful no-op (no write, no event)", async () => {
    setupItem({ current: 50 });

    const result = await setRemaining({
      itemId: ITEM_ID,
      remainingPercent: 50,
    });

    expect(result).toEqual({
      ok: true,
      data: { itemId: ITEM_ID, remainingPercent: 50, finished: false },
    });
    expect(updateCall()).toBeUndefined();
    expect(eventCall()).toBeUndefined();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects levels outside the five-step model", async () => {
    const result = await setRemaining({
      itemId: ITEM_ID,
      // @ts-expect-error — deliberately outside RemainingLevel
      remainingPercent: 60,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("validation");
  });

  it("reports foreign/missing items as not_found (RLS makes them invisible)", async () => {
    authed([{ table: "fridge_items", op: "select", result: { data: null } }]);

    const result = await setRemaining({
      itemId: ITEM_ID,
      remainingPercent: 25,
    });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "not_found" }),
    });
  });

  it("compensates the item update when the event insert fails", async () => {
    authed([
      {
        table: "fridge_items",
        op: "select",
        result: {
          data: { id: ITEM_ID, remaining_percent: 100, finished_at: null },
        },
      },
      {
        table: "fridge_items",
        op: "update",
        result: { data: [{ id: ITEM_ID }] },
      },
      {
        table: "consumption_events",
        op: "insert",
        result: { error: { message: "boom" } },
      },
      // The compensating revert:
      {
        table: "fridge_items",
        op: "update",
        result: { data: [{ id: ITEM_ID }] },
      },
    ]);

    const result = await setRemaining({
      itemId: ITEM_ID,
      remainingPercent: 75,
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "internal" }),
    });
    const updates = stub.calls.filter(
      (call) => call.table === "fridge_items" && call.op === "update",
    );
    expect(updates).toHaveLength(2);
    expect(updates[1].values).toMatchObject({
      remaining_percent: 100,
      finished_at: null,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

/* ─── deleteItem ──────────────────────────────────────────────────────────── */

describe("deleteItem", () => {
  it("deletes a caller-owned item and revalidates", async () => {
    authed([
      {
        table: "fridge_items",
        op: "delete",
        result: { data: [{ id: ITEM_ID }] },
      },
    ]);

    const result = await deleteItem({ itemId: ITEM_ID });

    expect(result).toEqual({ ok: true, data: { itemId: ITEM_ID } });
    const del = stub.calls.find((call) => call.op === "delete");
    expect(del?.eq).toEqual({ id: ITEM_ID });
    expect(revalidatePath).toHaveBeenCalledWith("/fridge");
    expect(revalidatePath).toHaveBeenCalledWith("/restock");
  });

  it("reports zero deleted rows as not_found", async () => {
    authed([{ table: "fridge_items", op: "delete", result: { data: [] } }]);

    const result = await deleteItem({ itemId: ITEM_ID });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "not_found" }),
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

/* ─── restockItem ─────────────────────────────────────────────────────────── */

describe("restockItem", () => {
  it("creates a NEW 100% unit for the same product, preserving the old row", async () => {
    authed([
      {
        table: "fridge_items",
        op: "select",
        result: { data: { product_id: PRODUCT_ID } },
      },
      {
        table: "fridge_items",
        op: "insert",
        result: { data: { id: "fresh-unit" } },
      },
    ]);

    const result = await restockItem({ itemId: ITEM_ID });

    expect(result).toEqual({ ok: true, data: { newItemId: "fresh-unit" } });
    const insert = stub.calls.find((call) => call.op === "insert");
    expect(insert?.values).toEqual({
      user_id: USER_ID,
      product_id: PRODUCT_ID,
      remaining_percent: 100,
    });
    // No update/delete ever touches the historical row.
    expect(stub.calls.some((call) => call.op === "update")).toBe(false);
    expect(stub.calls.some((call) => call.op === "delete")).toBe(false);
  });

  it("reports an invisible source item as not_found", async () => {
    authed([{ table: "fridge_items", op: "select", result: { data: null } }]);

    const result = await restockItem({ itemId: ITEM_ID });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "not_found" }),
    });
  });
});
