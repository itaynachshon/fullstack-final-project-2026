import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSupabaseStub,
  type ProgrammedResponse,
  type SupabaseStub,
} from "@/lib/actions/test-stubs";

import { getItemHistory } from "./history";

/* ─── Module mocks ────────────────────────────────────────────────────────── */

let stub: SupabaseStub;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => stub.client,
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
const ITEM_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_ID = "55555555-5555-4555-8555-555555555555";
const RESTOCKED_BY_ID = "44444444-4444-4444-8444-444444444444";

const PRODUCT_ROW = {
  id: PRODUCT_ID,
  barcode: "7290000000001",
  name: "חלב טרי 3%",
  brand: "Tara",
  package_size: "1 L",
  category: "Dairy",
  image_url: null,
  source: "catalog",
};

function itemRow(overrides?: Record<string, unknown>) {
  return {
    id: ITEM_ID,
    remaining_percent: 50,
    added_at: "2026-08-15T08:00:00.000Z",
    finished_at: null,
    restocked_from_item_id: null,
    product: PRODUCT_ROW,
    ...overrides,
  };
}

/**
 * Responses in the action's issue order: item read (fridge_items), events
 * read (consumption_events), restocked-by read (fridge_items — FIFO pairs it
 * with the second fridge_items select).
 */
function authed(responses: ProgrammedResponse[] = []) {
  stub = createSupabaseStub({ user: { id: USER_ID }, responses });
}

function programHistory(options?: {
  item?: unknown;
  events?: unknown[];
  restockedBy?: unknown[];
}) {
  authed([
    {
      table: "fridge_items",
      op: "select",
      result: { data: options?.item === undefined ? itemRow() : options.item },
    },
    {
      table: "consumption_events",
      op: "select",
      result: { data: options?.events ?? [] },
    },
    {
      table: "fridge_items",
      op: "select",
      result: { data: options?.restockedBy ?? [] },
    },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  authed();
});

/* ─── Gates ───────────────────────────────────────────────────────────────── */

describe("getItemHistory — gates", () => {
  it("rejects unauthenticated callers before touching the database", async () => {
    stub = createSupabaseStub({ user: null });
    const result = await getItemHistory({ itemId: ITEM_ID });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "unauthenticated" }),
    });
    expect(stub.calls).toHaveLength(0);
  });

  it("rejects a malformed id without touching the database", async () => {
    const result = await getItemHistory({ itemId: "not-a-uuid" });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "validation" }),
    });
    expect(stub.calls).toHaveLength(0);
  });

  it("reports a foreign/missing item as not_found (owner isolation via RLS)", async () => {
    programHistory({ item: null });
    const result = await getItemHistory({ itemId: ITEM_ID });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "not_found" }),
    });
  });
});

/* ─── Query shape ─────────────────────────────────────────────────────────── */

describe("getItemHistory — query shape", () => {
  it("issues exactly three queries: item+product embed, events, restocked-by", async () => {
    programHistory();
    await getItemHistory({ itemId: ITEM_ID });

    expect(stub.calls).toHaveLength(3);
    const [itemCall, eventsCall, restockedByCall] = stub.calls;

    // Product metadata rides the item query via the FK embed — no N+1.
    expect(itemCall.table).toBe("fridge_items");
    expect(itemCall.selected).toContain("product:products");
    expect(itemCall.selected).toContain("restocked_from_item_id");
    expect(itemCall.eq).toEqual({ id: ITEM_ID });

    expect(eventsCall.table).toBe("consumption_events");
    expect(eventsCall.eq).toEqual({ fridge_item_id: ITEM_ID });

    expect(restockedByCall.table).toBe("fridge_items");
    expect(restockedByCall.eq).toEqual({ restocked_from_item_id: ITEM_ID });
  });
});

/* ─── Derivation through the action ───────────────────────────────────────── */

describe("getItemHistory — derived history", () => {
  it("returns an added-only unit with an empty timeline", async () => {
    programHistory();
    const result = await getItemHistory({ itemId: ITEM_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      itemId: ITEM_ID,
      remainingPercent: 50,
      addedAt: "2026-08-15T08:00:00.000Z",
      lastConsumedAt: null,
      finishedAt: null,
      restockedFromItemId: null,
      restockedByItemId: null,
      restockedAt: null,
      timeline: [],
    });
    expect(result.data.product).toMatchObject({
      id: PRODUCT_ID,
      name: "חלב טרי 3%",
      category: "Dairy",
    });
  });

  it("derives lastConsumedAt from positive deltas only and maps the timeline", async () => {
    programHistory({
      events: [
        {
          id: "e1000000-0000-4000-8000-000000000000",
          delta_percent: 25,
          remaining_after: 75,
          created_at: "2026-08-16T09:00:00.000Z",
        },
        {
          id: "e2000000-0000-4000-8000-000000000000",
          delta_percent: -25,
          remaining_after: 100,
          created_at: "2026-08-17T10:00:00.000Z",
        },
      ],
    });
    const result = await getItemHistory({ itemId: ITEM_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The restoration is newer but must not become "last consumed".
    expect(result.data.lastConsumedAt).toBe("2026-08-16T09:00:00.000Z");
    expect(result.data.timeline).toEqual([
      {
        id: "e1000000-0000-4000-8000-000000000000",
        deltaPercent: 25,
        remainingAfter: 75,
        createdAt: "2026-08-16T09:00:00.000Z",
      },
      {
        id: "e2000000-0000-4000-8000-000000000000",
        deltaPercent: -25,
        remainingAfter: 100,
        createdAt: "2026-08-17T10:00:00.000Z",
      },
    ]);
  });

  it("exposes both lineage directions", async () => {
    programHistory({
      item: itemRow({
        remaining_percent: 0,
        finished_at: "2026-08-17T20:00:00.000Z",
        restocked_from_item_id: SOURCE_ID,
      }),
      restockedBy: [
        { id: RESTOCKED_BY_ID, added_at: "2026-08-18T09:15:00.000Z" },
      ],
    });
    const result = await getItemHistory({ itemId: ITEM_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.finishedAt).toBe("2026-08-17T20:00:00.000Z");
    expect(result.data.restockedFromItemId).toBe(SOURCE_ID);
    expect(result.data.restockedByItemId).toBe(RESTOCKED_BY_ID);
    expect(result.data.restockedAt).toBe("2026-08-18T09:15:00.000Z");
  });

  it("degrades a database error to a generic internal result", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    authed([
      {
        table: "fridge_items",
        op: "select",
        result: { error: { message: "boom" } },
      },
      { table: "consumption_events", op: "select", result: { data: [] } },
      { table: "fridge_items", op: "select", result: { data: [] } },
    ]);

    const result = await getItemHistory({ itemId: ITEM_ID });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "internal" }),
    });
    consoleError.mockRestore();
  });
});
