/**
 * Catalog text search — Supabase products table ONLY (never Open Food Facts;
 * OFF search is unreliable and out of scope, docs/TECHNICAL_DESIGN.md §5.2).
 *
 * Matching is `ILIKE '%q%'` over products.name, accelerated by the trigram
 * GIN index from the frozen migration — substring semantics that work for
 * Hebrew and Latin text alike (IMPLEMENTATION_PLAN.md: "trigram ILIKE +
 * pagination").
 *
 * Ordering note: TECHNICAL_DESIGN.md §5.4 sketches similarity() ordering, but
 * PostgREST cannot order by an expression and adding an RPC would require a
 * migration (frozen in Wave 2). We therefore order deterministically by
 * (name, id) — stable pagination, no duplicate/skipped rows across pages —
 * and substring matching alone keeps result sets narrow at catalog scale.
 *
 * hasMore probes PAGE_SIZE + 1 rows instead of issuing a COUNT query.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SearchResponse } from "@/lib/types";

import { PRODUCT_COLUMNS, toProduct, type ProductRow } from "./productRow";

export const PAGE_SIZE = 20;

/**
 * Escape LIKE metacharacters so user text always matches literally
 * ("50%" must match the string "50%", not act as a wildcard).
 */
function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function searchProducts(
  supabase: SupabaseClient,
  q: string,
  page: number,
): Promise<SearchResponse> {
  const offset = (page - 1) * PAGE_SIZE;

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .ilike("name", `%${escapeLikePattern(q)}%`)
    .order("name", { ascending: true })
    .order("id", { ascending: true }) // total order even between identical names
    .range(offset, offset + PAGE_SIZE); // inclusive → PAGE_SIZE + 1 rows max

  if (error) {
    throw new Error(`products search failed: ${error.message}`);
  }

  const rows = (data ?? []) as ProductRow[];
  return {
    items: rows.slice(0, PAGE_SIZE).map(toProduct),
    page,
    hasMore: rows.length > PAGE_SIZE,
  };
}
