/**
 * Barcode domain — pure TypeScript, no I/O, no Next.js imports.
 *
 * Implements the approved normalization / validation / classification pipeline
 * (docs/TECHNICAL_DESIGN.md §4, docs/research/BARCODE_APIS.md §3):
 *
 *   raw string
 *     → strip whitespace and hyphens
 *     → must be digits only                (else invalid: not a barcode)
 *     → length must be 8–14               (else invalid: unsupported length)
 *     → GS1 mod-10 check digit must hold  (else invalid: likely misread)
 *     → canonicalize                      (§ "Canonical form" below)
 *     → classify: RCN store-internal vs GTIN
 *
 * Canonical form follows the Open Food Facts storage convention so our cache
 * keys are byte-identical to OFF `code` values:
 *   - EAN-8 stays 8 digits (GTIN-8 is a separate allocation, not a truncation)
 *   - 9–12 digits are zero-padded to 13 (GTIN-12/UPC-A has an implied leading
 *     zero; shorter forms appear in the wild, e.g. UPC-A with its leading zero
 *     already dropped by a spreadsheet)
 *   - EAN-13 stays 13 digits
 *   - GTIN-14 with indicator 0 (retail consumer unit) strips to 13 digits;
 *     any other indicator is case/trade packaging and is rejected
 *
 * Barcodes are identifiers, not numbers: leading zeros are significant, so
 * everything here is strings in and strings out.
 *
 * NOTE: this file is also executed directly by Node (the seed scripts under
 * scripts/ import it), so its imports are type-only / relative — no "@/" path
 * alias and no runtime dependencies.
 */

import type { BarcodeClassification } from "../types";

/** Non-semantic separators tolerated in scanned/typed input. */
const SEPARATORS = /[\s-]+/g;

const DIGITS_ONLY = /^\d+$/;

const MIN_LENGTH = 8;
const MAX_LENGTH = 14;

/**
 * GS1 mod-10 check digit for a GTIN body (the code without its final digit).
 * Digits are weighted 3,1,3,1,… starting with weight 3 at the rightmost body
 * digit; the check digit lifts the sum to the next multiple of ten.
 * Weighting anchors at the RIGHT, so the result is invariant under left
 * zero-padding — which is what makes the OFF canonicalization sound.
 */
function computeCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = body.charCodeAt(body.length - 1 - i) - 48;
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

function hasValidCheckDigit(digits: string): boolean {
  return (
    computeCheckDigit(digits.slice(0, -1)) === digits.charCodeAt(digits.length - 1) - 48
  );
}

/**
 * True for a well-formed GTIN: digits only, a real GTIN length (8, 12, 13 or
 * 14), and a correct GS1 mod-10 check digit.
 *
 * Deliberately strict about length: a 9–11 digit string may still be
 * *accepted as input* by classifyBarcode (it zero-pads to a GTIN-13), but it
 * is not itself a GTIN.
 */
export function isValidGtin(code: string): boolean {
  return (
    DIGITS_ONLY.test(code) &&
    (code.length === 8 || code.length === 12 || code.length === 13 || code.length === 14) &&
    hasValidCheckDigit(code)
  );
}

/**
 * Structural normalization only (no check-digit validation): strips
 * separators and produces the canonical storage form described above.
 * Returns null when the input cannot be canonicalized at all (non-digit
 * characters, unsupported length, or a GTIN-14 that is not a retail unit).
 */
export function normalizeBarcode(raw: string): string | null {
  const stripped = raw.replace(SEPARATORS, "");
  if (!DIGITS_ONLY.test(stripped)) return null;
  return canonicalize(stripped);
}

/** Length-based canonicalization of a digits-only string; null = unsupported. */
function canonicalize(digits: string): string | null {
  const length = digits.length;
  if (length === 8) return digits; // EAN-8 stays 8
  if (length >= 9 && length <= 12) return digits.padStart(13, "0");
  if (length === 13) return digits;
  if (length === 14) {
    // Indicator 0 = the retail consumer unit itself; 1–9 = trade/case levels.
    return digits.startsWith("0") ? digits.slice(1) : null;
  }
  return null;
}

/**
 * RCN (Restricted Circulation Number) detection on the canonical 13-digit
 * form. GS1 reserves these prefixes for numbers with no global meaning —
 * supermarkets use them for weighed/store-packed goods:
 *   200–299 (region/retailer-defined; the common Israeli weighed-goods case),
 *   020–029 and 040–049 (company-internal),
 *   0000000 (company-internal numbering).
 * Prefix logic is only valid AFTER canonicalization to 13 digits (a 12-digit
 * code starting 2xx is prefix 02x once its implied leading zero is restored).
 */
function isRcn(canonical13: string): boolean {
  return (
    canonical13.startsWith("2") ||
    canonical13.startsWith("02") ||
    canonical13.startsWith("04") ||
    canonical13.startsWith("0000000")
  );
}

/**
 * The full pipeline (frozen module contract, docs/TECHNICAL_DESIGN.md §4.6):
 * normalize + validate + classify a raw scanned/typed barcode.
 *
 *   gtin    → safe to look up (locally, then Open Food Facts)
 *   rcn     → store-internal; must never reach any lookup
 *   invalid → reject before any database or network call
 */
export function classifyBarcode(raw: string): BarcodeClassification {
  const stripped = raw.replace(SEPARATORS, "");

  if (stripped.length === 0) {
    return { kind: "invalid", reason: "Empty barcode." };
  }
  if (!DIGITS_ONLY.test(stripped)) {
    return { kind: "invalid", reason: "Not a barcode: it must contain digits only." };
  }
  if (stripped.length < MIN_LENGTH || stripped.length > MAX_LENGTH) {
    return {
      kind: "invalid",
      reason: `Unsupported barcode length (${stripped.length} digits).`,
    };
  }
  if (!hasValidCheckDigit(stripped)) {
    return {
      kind: "invalid",
      reason: "Check digit mismatch — probably a misread, try scanning again.",
    };
  }

  const canonical = canonicalize(stripped);
  if (canonical === null) {
    // Only reachable for GTIN-14 with a non-zero indicator digit.
    return {
      kind: "invalid",
      reason: `GTIN-14 with indicator ${stripped[0]} is case/trade packaging, not a retail unit.`,
    };
  }

  if (canonical.length === 13 && isRcn(canonical)) {
    return { kind: "rcn", canonical };
  }
  return { kind: "gtin", canonical };
}
