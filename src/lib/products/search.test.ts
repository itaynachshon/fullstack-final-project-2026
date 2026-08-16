import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { ProductRow } from "@/lib/products/productRow";
import { PAGE_SIZE, searchProducts } from "@/lib/products/search";

function makeRows(count: number): ProductRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    barcode: null,
    name: `חלב ${i}`,
    brand: null,
    package_size: null,
    category: "Dairy",
    image_url: null,
    source: "catalog",
  }));
}

/** Records the ilike pattern, order columns and range bounds the service asks for. */
function fakeSupabase(result: {
  data: ProductRow[] | null;
  error: { message: string } | null;
}) {
  const calls = {
    ilike: undefined as [string, string] | undefined,
    orders: [] as Array<[string, boolean]>,
    range: undefined as [number, number] | undefined,
  };

  const client = {
    from: (table: string) => {
      expect(table).toBe("products");
      return {
        select: () => ({
          ilike: (column: string, pattern: string) => {
            calls.ilike = [column, pattern];
            return {
              order: (col1: string, opts1: { ascending: boolean }) => {
                calls.orders.push([col1, opts1.ascending]);
                return {
                  order: (col2: string, opts2: { ascending: boolean }) => {
                    calls.orders.push([col2, opts2.ascending]);
                    return {
                      range: async (from: number, to: number) => {
                        calls.range = [from, to];
                        return result;
                      },
                    };
                  },
                };
              },
            };
          },
        }),
      };
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

describe("searchProducts — query construction", () => {
  it("substring-matches on name with deterministic (name, id) ordering and a 21-row page probe", async () => {
    const { client, calls } = fakeSupabase({ data: makeRows(3), error: null });

    await searchProducts(client, "חלב", 1);

    expect(calls.ilike).toEqual(["name", "%חלב%"]);
    expect(calls.orders).toEqual([
      ["name", true],
      ["id", true],
    ]);
    expect(calls.range).toEqual([0, PAGE_SIZE]); // inclusive → 21 rows max
  });

  it("escapes LIKE wildcards so user text matches literally", async () => {
    const { client, calls } = fakeSupabase({ data: [], error: null });

    await searchProducts(client, "50%_מבצע\\", 1);

    expect(calls.ilike?.[1]).toBe("%50\\%\\_מבצע\\\\%");
  });

  it("offsets later pages by the fixed page size", async () => {
    const { client, calls } = fakeSupabase({ data: [], error: null });

    await searchProducts(client, "חלב", 3);

    expect(calls.range).toEqual([40, 40 + PAGE_SIZE]);
  });
});

describe("searchProducts — response shaping", () => {
  it("maps rows to the frozen Product shape", async () => {
    const { client } = fakeSupabase({ data: makeRows(2), error: null });

    const response = await searchProducts(client, "חלב", 1);

    expect(response.page).toBe(1);
    expect(response.hasMore).toBe(false);
    expect(response.items[0]).toEqual({
      id: "00000000-0000-0000-0000-000000000000",
      barcode: null,
      name: "חלב 0",
      brand: null,
      packageSize: null,
      category: "Dairy",
      imageUrl: null,
      source: "catalog",
    });
  });

  it("returns exactly PAGE_SIZE items with hasMore=true when the probe row exists", async () => {
    const { client } = fakeSupabase({
      data: makeRows(PAGE_SIZE + 1),
      error: null,
    });

    const response = await searchProducts(client, "חלב", 1);

    expect(response.items).toHaveLength(PAGE_SIZE);
    expect(response.hasMore).toBe(true);
  });

  it("returns an empty page (hasMore=false) for no matches or pages beyond the results", async () => {
    const { client } = fakeSupabase({ data: [], error: null });

    const response = await searchProducts(client, "אין כזה מוצר", 7);

    expect(response).toEqual({ items: [], page: 7, hasMore: false });
  });

  it("throws on a database error (route surfaces 500 'internal')", async () => {
    const { client } = fakeSupabase({
      data: null,
      error: { message: "timeout" },
    });

    await expect(searchProducts(client, "חלב", 1)).rejects.toThrow(
      /products search failed/,
    );
  });
});
