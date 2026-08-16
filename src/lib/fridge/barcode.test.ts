import { describe, expect, it } from "vitest";

import { classifyBarcode } from "./barcode";

/**
 * Wave 2 seam tests — input hygiene only. Full GTIN check-digit validation
 * and RCN detection are Agent A's domain (src/lib/barcode/) and replace this
 * module's internals in Wave 3; these tests pin the seam's contract shape.
 */
describe("classifyBarcode (Wave 2 seam)", () => {
  it("accepts plausible digit strings and strips separators", () => {
    expect(classifyBarcode("7290000066318")).toEqual({
      kind: "gtin",
      canonical: "7290000066318",
    });
    expect(classifyBarcode(" 729-0000 066318 ")).toEqual({
      kind: "gtin",
      canonical: "7290000066318",
    });
  });

  it("rejects empty input", () => {
    expect(classifyBarcode("   ").kind).toBe("invalid");
  });

  it("rejects non-digit input", () => {
    expect(classifyBarcode("candy123").kind).toBe("invalid");
  });

  it("rejects implausible lengths", () => {
    expect(classifyBarcode("1234567").kind).toBe("invalid"); // 7 digits
    expect(classifyBarcode("123456789012345").kind).toBe("invalid"); // 15
  });
});
