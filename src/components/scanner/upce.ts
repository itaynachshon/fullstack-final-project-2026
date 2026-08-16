/**
 * UPC-E → UPC-A expansion — pure, scanner-layer only.
 *
 * docs/TECHNICAL_DESIGN.md §4.1: "UPC-E detections are expanded to their
 * UPC-A (GTIN-12) form at the scanner layer — the standard GS1 expansion —
 * before entering this module [the barcode domain]." UPC-E is a
 * zero-suppressed compression of a GTIN-12 (docs/research/BARCODE_APIS.md
 * §3.1); the 8 digits ZXing reports are: number-system digit (0/1), six data
 * digits, and the check digit — which is defined over the EXPANDED form, so
 * it carries over unchanged and validates only after expansion.
 *
 * The expansion pattern is selected by the last data digit (GS1 GenSpecs §5;
 * the same table ZXing itself uses for its UPC-E extension):
 *
 *   d6 = 0–2 → NS d1 d2 d6 0000  d3 d4 d5 C
 *   d6 = 3   → NS d1 d2 d3 00000 d4 d5    C
 *   d6 = 4   → NS d1 d2 d3 d4 00000 d5    C
 *   d6 = 5–9 → NS d1 d2 d3 d4 d5 0000 d6  C
 *
 * Anything that is not exactly 8 digits is returned unchanged — the barcode
 * domain's classifier is the authority on validity, not this helper.
 */

const UPC_E_SHAPE = /^[01]\d{7}$/;

export function expandUpcE(raw: string): string {
  if (!UPC_E_SHAPE.test(raw)) return raw;

  const numberSystem = raw[0];
  const data = raw.slice(1, 7);
  const check = raw[7];
  const last = data[5];

  let body: string;
  if (last === "0" || last === "1" || last === "2") {
    body = `${data.slice(0, 2)}${last}0000${data.slice(2, 5)}`;
  } else if (last === "3") {
    body = `${data.slice(0, 3)}00000${data.slice(3, 5)}`;
  } else if (last === "4") {
    body = `${data.slice(0, 4)}00000${data[4]}`;
  } else {
    body = `${data.slice(0, 5)}0000${last}`;
  }

  return `${numberSystem}${body}${check}`;
}
