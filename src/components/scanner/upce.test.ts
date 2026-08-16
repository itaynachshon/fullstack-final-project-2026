import { describe, expect, it } from "vitest";

import { classifyBarcode } from "@/lib/barcode";

import { expandUpcE } from "./upce";

/**
 * Vectors constructed from the GS1 zero-suppression rules and verified with
 * the GS1 mod-10 check digit (the UPC-E check digit is defined over the
 * expanded UPC-A form, so a correct expansion — and only a correct one —
 * produces a code that passes classifyBarcode).
 */
describe("expandUpcE — the four GS1 expansion patterns", () => {
  it.each([
    // [pattern, upce, expected upc-a]
    ["last digit 0–2: NS d1 d2 d6 0000 d3 d4 d5 C", "01267813", "012100006783"],
    ["last digit 3: NS d1 d2 d3 00000 d4 d5 C", "03451233", "034500000123"],
    ["last digit 4: NS d1 d2 d3 d4 00000 d5 C", "09876547", "098760000057"],
    ["last digit 5–9: NS d1 d2 d3 d4 d5 0000 d6 C", "01234558", "012345000058"],
    ["number system 1 expands the same way", "11234555", "112345000055"],
  ])("%s", (_pattern, upce, upca) => {
    expect(expandUpcE(upce)).toBe(upca);
  });

  it("expanded output enters the barcode domain as a valid GTIN", () => {
    // The full scanner-layer → domain handshake (TECHNICAL_DESIGN §4.1):
    // scanner expands, classifyBarcode validates the carried-over check
    // digit and canonicalizes (UPC-A pads to 13).
    expect(classifyBarcode(expandUpcE("01234558"))).toEqual({
      kind: "gtin",
      canonical: "0012345000058",
    });
  });

  it("the compressed form itself would NOT survive the classifier (why expansion matters)", () => {
    // Without expansion an 8-digit UPC-E reaches the classifier as a fake
    // EAN-8. Usually its carried-over check digit fails (as here) — and even
    // when it passes by 1-in-10 coincidence, the 8 digits are a fabricated
    // identity, not the product's GTIN. Expansion is keyed on the decoder's
    // reported format, never on checksum luck.
    expect(classifyBarcode("01267813").kind).toBe("invalid");
  });
});

describe("expandUpcE — pass-through for everything that is not UPC-E", () => {
  it.each([
    ["EAN-8 (number system not 0/1)", "96385074"],
    ["EAN-13", "7290000066318"],
    ["UPC-A (already 12 digits)", "036000291452"],
    ["7 digits (no number system reported)", "1234565"],
    ["non-digit input", "0123456a"],
    ["empty string", ""],
  ])("returns %s unchanged", (_label, raw) => {
    expect(expandUpcE(raw)).toBe(raw);
  });
});
