/**
 * WAVE 3 INTEGRATION SEAM — this is NOT the real barcode domain.
 *
 * Agent A owns GTIN normalization, check-digit validation, canonicalization,
 * and RCN classification in `src/lib/barcode/` behind the frozen signature
 *
 *   classifyBarcode(raw: string): BarcodeClassification
 *
 * (docs/TECHNICAL_DESIGN.md §4.6). That module is being built in a parallel
 * worktree and does not exist on this branch, so this file provides the same
 * signature with shape-level input hygiene ONLY — deliberately NOT a second
 * GTIN algorithm:
 *
 *   - strips whitespace/hyphens, requires digits, requires a plausible length
 *   - performs NO check-digit validation, NO RCN detection, NO zero-pad /
 *     strip canonicalization (all Agent A's)
 *
 * Wave 3 integration: replace this file's implementation with
 *
 *   export { classifyBarcode } from "@/lib/barcode";
 *
 * Every caller (createManualProduct, the /add manual-code and manual-form
 * fields) imports from here, so the swap is a one-line change.
 */

import type { BarcodeClassification } from "@/lib/types";

export function classifyBarcode(raw: string): BarcodeClassification {
  const stripped = raw.replace(/[\s-]/g, "");
  if (stripped.length === 0) {
    return {
      kind: "invalid",
      reason: "Enter the digits printed under the barcode lines.",
    };
  }
  if (!/^\d+$/.test(stripped)) {
    return { kind: "invalid", reason: "A barcode contains digits only." };
  }
  if (stripped.length < 8 || stripped.length > 14) {
    return {
      kind: "invalid",
      reason: "That code doesn't look right — check the digits under the lines.",
    };
  }
  return { kind: "gtin", canonical: stripped };
}
