import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { lookupProduct } from "@/lib/products/lookup";
import { fetchOffProduct } from "@/lib/products/offClient";
import type { ProductRow } from "@/lib/products/productRow";

vi.mock("@/lib/products/offClient", () => ({
  fetchOffProduct: vi.fn(),
}));

const offMock = vi.mocked(fetchOffProduct);

/* Real classifyBarcode runs inside lookupProduct — vectors from the barcode
 * suite: a valid EAN-13, a valid weighed-goods RCN, and a bad check digit. */
const BAMBA = "7290000066318";
const RCN_WEIGHED = "2000000000008";
const BAD_CHECK_DIGIT = "1234567890123";

const CATALOG_ROW: ProductRow = {
  id: "11111111-1111-1111-1111-111111111111",
  barcode: BAMBA,
  name: "במבה",
  brand: "אסם",
  package_size: "80 גרם",
  category: "Snacks",
  image_url: null,
  source: "catalog",
};

const USER_ID = "99999999-9999-9999-9999-999999999999";

type QueryResult<T> = {
  data: T;
  error: { code?: string; message: string } | null;
};

/**
 * Minimal stand-in for the two PostgREST call shapes the service uses:
 *   from().select().eq().maybeSingle()   — consumed from `selectResults` in order
 *   from().insert().select().single()    — answered by `insertResult`
 */
function fakeSupabase(config: {
  selectResults?: Array<QueryResult<ProductRow | null>>;
  insertResult?: QueryResult<ProductRow | null>;
}) {
  const calls = {
    selectBarcodes: [] as string[],
    inserts: [] as Record<string, unknown>[],
  };
  let selectIndex = 0;

  const client = {
    from: (table: string) => {
      expect(table).toBe("products");
      return {
        select: () => ({
          eq: (_column: string, value: string) => {
            calls.selectBarcodes.push(value);
            return {
              maybeSingle: async () => config.selectResults![selectIndex++],
            };
          },
        }),
        insert: (payload: Record<string, unknown>) => {
          calls.inserts.push(payload);
          return {
            select: () => ({ single: async () => config.insertResult }),
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

beforeEach(() => {
  offMock.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("lookupProduct — classification short-circuits (no I/O)", () => {
  it("returns invalid without touching the DB or OFF", async () => {
    const { client, calls } = fakeSupabase({});

    const result = await lookupProduct(client, USER_ID, BAD_CHECK_DIGIT);

    expect(result.status).toBe("invalid");
    expect(calls.selectBarcodes).toHaveLength(0);
    expect(offMock).not.toHaveBeenCalled();
  });

  it("returns rcn with an explanation, without touching the DB or OFF", async () => {
    const { client, calls } = fakeSupabase({});

    const result = await lookupProduct(client, USER_ID, RCN_WEIGHED);

    expect(result.status).toBe("rcn");
    if (result.status !== "rcn") return;
    expect(result.reason).toMatch(/store-internal/i);
    expect(calls.selectBarcodes).toHaveLength(0);
    expect(offMock).not.toHaveBeenCalled();
  });
});

describe("lookupProduct — catalog hit", () => {
  it("returns the local row with source 'db' and never calls OFF", async () => {
    const { client, calls } = fakeSupabase({
      selectResults: [{ data: CATALOG_ROW, error: null }],
    });

    const result = await lookupProduct(client, USER_ID, ` ${BAMBA} `);

    expect(result).toEqual({
      status: "found",
      source: "db",
      product: {
        id: CATALOG_ROW.id,
        barcode: BAMBA,
        name: "במבה",
        brand: "אסם",
        packageSize: "80 גרם",
        category: "Snacks",
        imageUrl: null,
        source: "catalog",
      },
    });
    // Whitespace was stripped: the DB was queried by the canonical form.
    expect(calls.selectBarcodes).toEqual([BAMBA]);
    expect(offMock).not.toHaveBeenCalled();
  });
});

describe("lookupProduct — OFF fallback and cache write", () => {
  it("caches an OFF hit with source 'off', creator id and mapped category, and returns the inserted row", async () => {
    const insertedRow: ProductRow = {
      ...CATALOG_ROW,
      id: "22222222-2222-2222-2222-222222222222",
      source: "off",
    };
    const { client, calls } = fakeSupabase({
      selectResults: [{ data: null, error: null }],
      insertResult: { data: insertedRow, error: null },
    });
    offMock.mockResolvedValue({
      outcome: "found",
      product: {
        name: "במבה",
        brand: "אסם",
        packageSize: "80 גרם",
        imageUrl: null,
      },
    });

    const result = await lookupProduct(client, USER_ID, BAMBA);

    expect(offMock).toHaveBeenCalledWith(BAMBA);
    expect(calls.inserts).toEqual([
      {
        barcode: BAMBA,
        name: "במבה",
        brand: "אסם",
        package_size: "80 גרם",
        category: "Snacks", // mapCategory("במבה") — shared keyword mapper
        image_url: null,
        source: "off",
        created_by: USER_ID,
      },
    ]);
    expect(result).toMatchObject({
      status: "found",
      source: "off",
      product: { id: insertedRow.id, source: "off" },
    });
  });

  it("re-selects and returns the winner row when a concurrent insert hits the unique barcode index", async () => {
    const winnerRow: ProductRow = {
      ...CATALOG_ROW,
      id: "33333333-3333-3333-3333-333333333333",
      source: "off",
    };
    const { client, calls } = fakeSupabase({
      selectResults: [
        { data: null, error: null }, // step-2 miss
        { data: winnerRow, error: null }, // post-conflict re-select
      ],
      insertResult: {
        data: null,
        error: {
          code: "23505",
          message: "duplicate key value violates unique constraint",
        },
      },
    });
    offMock.mockResolvedValue({
      outcome: "found",
      product: { name: "במבה", brand: null, packageSize: null, imageUrl: null },
    });

    const result = await lookupProduct(client, USER_ID, BAMBA);

    expect(calls.selectBarcodes).toEqual([BAMBA, BAMBA]);
    expect(result).toMatchObject({
      status: "found",
      source: "off",
      product: { id: winnerRow.id },
    });
  });

  it("returns a plain not_found (no fallback flag) on a definitive OFF miss", async () => {
    const { client } = fakeSupabase({
      selectResults: [{ data: null, error: null }],
    });
    offMock.mockResolvedValue({ outcome: "not_found" });

    const result = await lookupProduct(client, USER_ID, BAMBA);

    expect(result).toEqual({ status: "not_found", barcode: BAMBA });
    expect(result).not.toHaveProperty("fallbackUsed");
  });

  it.each(["timeout", "network", "upstream", "invalid_response"] as const)(
    "degrades an OFF %s failure to not_found with fallbackUsed",
    async (reason) => {
      const { client } = fakeSupabase({
        selectResults: [{ data: null, error: null }],
      });
      offMock.mockResolvedValue({ outcome: "failure", reason });

      const result = await lookupProduct(client, USER_ID, BAMBA);

      expect(result).toEqual({
        status: "not_found",
        barcode: BAMBA,
        fallbackUsed: true,
      });
    },
  );
});

describe("lookupProduct — our own DB failing is a real error", () => {
  it("throws when the catalog read fails (route surfaces 500 'internal')", async () => {
    const { client } = fakeSupabase({
      selectResults: [{ data: null, error: { message: "connection refused" } }],
    });

    await expect(lookupProduct(client, USER_ID, BAMBA)).rejects.toThrow(
      /products lookup failed/,
    );
    expect(offMock).not.toHaveBeenCalled();
  });

  it("throws when the cache insert fails for a non-conflict reason", async () => {
    const { client } = fakeSupabase({
      selectResults: [{ data: null, error: null }],
      insertResult: {
        data: null,
        error: { code: "57014", message: "canceling statement" },
      },
    });
    offMock.mockResolvedValue({
      outcome: "found",
      product: { name: "במבה", brand: null, packageSize: null, imageUrl: null },
    });

    await expect(lookupProduct(client, USER_ID, BAMBA)).rejects.toThrow(
      /cache insert failed/,
    );
  });
});
