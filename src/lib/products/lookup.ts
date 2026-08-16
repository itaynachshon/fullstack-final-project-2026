/**
 * Product lookup service — the resolution chain of docs/TECHNICAL_DESIGN.md §5:
 *
 *   classify → products table → Open Food Facts → cache → not_found
 *
 * Ordering guarantees (each step runs only if the previous one missed):
 *   1. invalid / RCN codes never touch the database or the network;
 *   2. a catalog hit never calls Open Food Facts;
 *   3. an OFF hit is cached under the CALLER'S JWT (RLS insert policy:
 *      created_by = auth.uid(), source = 'off') and re-read on a concurrent
 *      duplicate — the unique barcode index stays authoritative;
 *   4. OFF misses and failures both degrade to not_found (fallbackUsed marks
 *      the failure case); only OUR database failing is a real error (thrown,
 *      surfaced by the route as 500 'internal').
 *
 * No negative caching: an OFF miss writes nothing (§5.2 — a product may be
 * added to OFF tomorrow).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { classifyBarcode } from "@/lib/barcode";
import type { LookupResponse } from "@/lib/types";

import { mapCategory } from "./categorize";
import { fetchOffProduct } from "./offClient";
import { PRODUCT_COLUMNS, toProduct, type ProductRow } from "./productRow";

/**
 * Shown when a scanned code is store-internal (weighed goods, deli, bakery):
 * by the GS1 standard such codes cannot exist in any shared database, so the
 * UI routes straight to manual entry (docs/TECHNICAL_DESIGN.md §4.4).
 */
const RCN_REASON =
  "This is a store-internal code (weighed or packed in-store), so it cannot be " +
  "found in any product catalog. Add the product manually.";

/** Postgres unique_violation — the concurrent-first-scan race, not an error. */
const UNIQUE_VIOLATION = "23505";

export async function lookupProduct(
  supabase: SupabaseClient,
  userId: string,
  rawBarcode: string,
): Promise<LookupResponse> {
  /* 1 — classify; reject invalid/RCN before any I/O */
  const classification = classifyBarcode(rawBarcode);
  if (classification.kind === "invalid") {
    return { status: "invalid", reason: classification.reason };
  }
  if (classification.kind === "rcn") {
    return { status: "rcn", reason: RCN_REASON };
  }
  const { canonical } = classification;

  /* 2 — shared catalog by canonical barcode */
  const local = await selectByBarcode(supabase, canonical);
  if (local) {
    return { status: "found", product: toProduct(local), source: "db" };
  }

  /* 3 — Open Food Facts fallback */
  const off = await fetchOffProduct(canonical);

  if (off.outcome === "failure") {
    // Degrade, never 5xx (§5.3): the manual-entry path is the recovery.
    console.warn(
      `[lookup] Open Food Facts ${off.reason} for ${canonical}; degrading to not_found`,
    );
    return { status: "not_found", barcode: canonical, fallbackUsed: true };
  }

  if (off.outcome === "not_found") {
    return { status: "not_found", barcode: canonical };
  }

  /* 4 — cache the OFF hit, safe under concurrent first-scans */
  const { data: inserted, error } = await supabase
    .from("products")
    .insert({
      barcode: canonical,
      name: off.product.name,
      brand: off.product.brand,
      package_size: off.product.packageSize,
      category: mapCategory(off.product.name, off.product.brand),
      image_url: off.product.imageUrl,
      source: "off",
      created_by: userId,
    })
    .select(PRODUCT_COLUMNS)
    .single();

  if (!error) {
    return {
      status: "found",
      product: toProduct(inserted as ProductRow),
      source: "off",
    };
  }

  if (error.code === UNIQUE_VIOLATION) {
    // Another user cached this barcode between our select and insert. Their
    // row is the canonical one — return it. (Rows are never deleted, so the
    // re-select cannot miss.)
    const winner = await selectByBarcode(supabase, canonical);
    if (winner) {
      return { status: "found", product: toProduct(winner), source: "off" };
    }
  }

  // Our own database misbehaving is genuinely exceptional (§5.3 last row).
  throw new Error(
    `products cache insert failed for ${canonical}: ${error.message}`,
  );
}

async function selectByBarcode(
  supabase: SupabaseClient,
  canonical: string,
): Promise<ProductRow | null> {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("barcode", canonical)
    .maybeSingle();

  if (error) {
    throw new Error(
      `products lookup failed for ${canonical}: ${error.message}`,
    );
  }
  return (data as ProductRow | null) ?? null;
}
