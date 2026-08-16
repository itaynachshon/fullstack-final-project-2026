import { describe, expect, it } from "vitest";

import { classifyBarcode, isValidGtin, normalizeBarcode } from "@/lib/barcode";

/**
 * Table-driven tests for the barcode domain (docs/TECHNICAL_DESIGN.md §4).
 *
 * Real-world vectors: Bamba 7290000066318, Cottage 7290004127329 and Tnuva
 * milk 7290004131074 are verified Israeli retail GTINs from the research
 * reports; 036000291452 / 034000470693 are classic US UPC-A examples; 96385074
 * is the GS1 documentation EAN-8. Synthetic vectors had their check digits
 * computed with the GS1 mod-10 algorithm.
 */

describe("classifyBarcode — valid GTIN inputs", () => {
  it.each([
    // [label, raw input, expected canonical]
    ["valid EAN-8 stays 8 digits", "96385074", "96385074"],
    ["valid EAN-13 stays 13 digits", "7290000066318", "7290000066318"],
    ["another valid EAN-13 (Cottage)", "7290004127329", "7290004127329"],
    ["another valid EAN-13 (Tnuva milk)", "7290004131074", "7290004131074"],
    [
      "EAN-13 with check digit 0 (sum divisible by ten)",
      "7290000000060",
      "7290000000060",
    ],
    ["valid UPC-A zero-pads to 13", "036000291452", "0036000291452"],
    [
      "UPC-A leading zero is preserved in the canonical form",
      "034000470693",
      "0034000470693",
    ],
    [
      "11-digit input (UPC-A that lost its leading zero) pads to 13",
      "34000470693",
      "0034000470693",
    ],
    ["9-digit input pads to 13", "123456784", "0000123456784"],
    [
      "GTIN-14 with indicator 0 strips to 13",
      "07290000066318",
      "7290000066318",
    ],
    [
      "GTIN-14 form of a UPC-A resolves to the same canonical",
      "00034000470693",
      "0034000470693",
    ],
    [
      "whitespace separators are stripped",
      " 7290 0000 6631 8 ",
      "7290000066318",
    ],
    ["hyphen separators are stripped", "729-0000-066318", "7290000066318"],
    ["mixed separators around an EAN-8", " 9638-5074 ", "96385074"],
  ])("%s", (_label, raw, canonical) => {
    expect(classifyBarcode(raw)).toEqual({ kind: "gtin", canonical });
  });
});

describe("classifyBarcode — RCN / store-internal codes", () => {
  it.each([
    // [label, raw input, expected canonical]
    [
      "13-digit 2xx prefix (Israeli weighed goods)",
      "2000000000008",
      "2000000000008",
    ],
    ["13-digit 02x prefix", "0212345678909", "0212345678909"],
    [
      "12-digit UPC starting with 2 pads into the 02x RCN range",
      "212345678909",
      "0212345678909",
    ],
    ["13-digit 04x company-internal prefix", "0400000000008", "0400000000008"],
    [
      "all-zeros GS1 prefix (company-internal numbering)",
      "0000000123457",
      "0000000123457",
    ],
    ["all-zeros code", "0000000000000", "0000000000000"],
  ])("%s", (_label, raw, canonical) => {
    expect(classifyBarcode(raw)).toEqual({ kind: "rcn", canonical });
  });

  it("validates the check digit before classifying as RCN (misread beats RCN)", () => {
    // Same 2xx code as above with a corrupted final digit.
    expect(classifyBarcode("2000000000009").kind).toBe("invalid");
  });
});

describe("classifyBarcode — invalid inputs", () => {
  it.each([
    // [label, raw input, reason fragment expected in the message]
    ["empty string", "", /empty/i],
    ["whitespace only", "   ", /empty/i],
    ["separators only", "- -", /empty/i],
    ["alphabetic input", "hello", /digits/i],
    ["mixed alphanumeric input", "72900000663a8", /digits/i],
    ["digit-lookalike unicode input", "١٢٣٤٥٦٧٨", /digits/i],
    ["emoji garbage", "🥛🥛🥛", /digits/i],
    [
      "too short (7 digits — UPC-E must be expanded before this module)",
      "1234567",
      /length/i,
    ],
    ["single digit", "5", /length/i],
    ["too long (15 digits)", "123456789012345", /length/i],
    ["EAN-8 with a wrong check digit", "96385075", /check digit/i],
    ["EAN-13 with a wrong check digit", "7290000066319", /check digit/i],
    ["UPC-A with a wrong check digit", "036000291453", /check digit/i],
    [
      "GTIN-14 with non-zero indicator (case code, check digit valid)",
      "17290000066315",
      /indicator 1/i,
    ],
  ])("%s", (_label, raw, reasonPattern) => {
    const result = classifyBarcode(raw);
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.reason).toMatch(reasonPattern);
  });
});

describe("normalizeBarcode — structural canonicalization only", () => {
  it.each([
    // [label, raw input, expected canonical or null]
    ["EAN-13 passes through", "7290000066318", "7290000066318"],
    [
      "a wrong check digit still normalizes (validation is separate)",
      "7290000066319",
      "7290000066319",
    ],
    ["UPC-A pads to 13", "034000470693", "0034000470693"],
    [
      "separators are stripped before padding",
      "0729-0000-0663-18",
      "7290000066318",
    ],
    [
      "GTIN-14 with indicator 0 strips to 13",
      "07290000066318",
      "7290000066318",
    ],
    [
      "GTIN-14 with non-zero indicator has no canonical form",
      "17290000066315",
      null,
    ],
    ["non-digit input has no canonical form", "12ab34", null],
    ["unsupported length has no canonical form", "1234567", null],
    ["empty input has no canonical form", "", null],
  ])("%s", (_label, raw, expected) => {
    expect(normalizeBarcode(raw)).toBe(expected);
  });
});

describe("isValidGtin — strict GTIN lengths + GS1 mod-10", () => {
  it.each([
    ["EAN-8", "96385074"],
    ["UPC-A (GTIN-12)", "036000291452"],
    ["EAN-13", "7290000066318"],
    ["GTIN-14 with indicator 0", "07290000066318"],
    // A real GTIN-14 case code is a *valid identifier* even though
    // classifyBarcode rejects it for this app (not a retail unit).
    ["GTIN-14 with indicator 1", "17290000066315"],
  ])("accepts a valid %s", (_label, code) => {
    expect(isValidGtin(code)).toBe(true);
  });

  it.each([
    [
      "a 9-digit string (not a GTIN length, even with a fine check digit)",
      "123456784",
    ],
    ["an 11-digit string", "34000470693"],
    ["an EAN-8 with a bad check digit", "96385075"],
    ["an EAN-13 with a bad check digit", "7290000066319"],
    ["non-digit input", "7290000o66318"],
    ["the empty string", ""],
  ])("rejects %s", (_label, code) => {
    expect(isValidGtin(code)).toBe(false);
  });
});
