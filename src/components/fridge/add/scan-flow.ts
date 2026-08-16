/**
 * Pure decision logic for the scan → lookup flow (Wave 3 integration seam).
 *
 * ScanPanel wires the scanner and the fetch around these two functions; the
 * routing rules themselves (docs/TECHNICAL_DESIGN.md §5.1) live here so the
 * integrated behavior is unit-testable in the node-environment Vitest setup
 * without rendering components:
 *
 *   raw code → classifyBarcode →
 *     invalid → REJECT (no API call — misread pill / field error)
 *     rcn     → RCN sheet → manual entry, barcode cleared (OFF never called)
 *     gtin    → GET /api/products/lookup with the CANONICAL form
 *
 *   lookup body →
 *     found     → product-confirm sheet
 *     not_found → manual entry with the canonical barcode prefilled
 *     rcn       → RCN sheet (server re-classification agrees by construction)
 *     invalid   → treated as a misread (same module validates client-side,
 *                 so this only happens if client and server ever diverge)
 */

import { classifyBarcode } from "@/lib/barcode";
import type { LookupResponse, Product } from "@/lib/types";

/** What to do with a raw scanned/typed code BEFORE any network call. */
export type ScanDecision =
  | { action: "reject"; reason: string }
  | { action: "rcn" }
  | { action: "lookup"; canonical: string };

export function decideScan(raw: string): ScanDecision {
  const classified = classifyBarcode(raw);
  if (classified.kind === "invalid") {
    return { action: "reject", reason: classified.reason };
  }
  if (classified.kind === "rcn") {
    return { action: "rcn" };
  }
  return { action: "lookup", canonical: classified.canonical };
}

/** UI-facing outcome of a completed lookup call. */
export type LookupOutcome =
  | { kind: "found"; product: Product }
  | { kind: "not_found"; barcode: string }
  | { kind: "rcn" }
  | { kind: "invalid" };

export function outcomeOf(body: LookupResponse): LookupOutcome {
  switch (body.status) {
    case "found":
      return { kind: "found", product: body.product };
    case "not_found":
      return { kind: "not_found", barcode: body.barcode };
    case "rcn":
      return { kind: "rcn" };
    case "invalid":
      return { kind: "invalid" };
  }
}
