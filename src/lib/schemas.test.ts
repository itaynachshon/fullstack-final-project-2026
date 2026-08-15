import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";

import {
  addToFridgeSchema,
  createManualProductSchema,
  deleteItemSchema,
  fieldErrorsOf,
  lookupQuerySchema,
  restockItemSchema,
  searchQuerySchema,
  setRemainingSchema,
} from "@/lib/schemas";
import type {
  AddToFridgeInput,
  CreateManualProductInput,
  DeleteItemInput,
  RestockItemInput,
  SetRemainingInput,
} from "@/lib/types";

const VALID_UUID = "8f14e45f-ceea-4f1b-8b13-2c5a0d1e9b42";

describe("lookupQuerySchema", () => {
  it("accepts a typical EAN-13 barcode", () => {
    const result = lookupQuerySchema.parse({ barcode: "7290000000001" });
    expect(result.barcode).toBe("7290000000001");
  });

  it("trims surrounding whitespace", () => {
    const result = lookupQuerySchema.parse({ barcode: "  729123  " });
    expect(result.barcode).toBe("729123");
  });

  it.each([
    ["empty string", { barcode: "" }],
    ["whitespace only", { barcode: "   " }],
    ["longer than 20 chars", { barcode: "1".repeat(21) }],
    ["missing barcode", {}],
  ])("rejects %s", (_label, input) => {
    expect(lookupQuerySchema.safeParse(input).success).toBe(false);
  });

  it("accepts the 1 and 20 character boundaries", () => {
    expect(lookupQuerySchema.safeParse({ barcode: "1" }).success).toBe(true);
    expect(
      lookupQuerySchema.safeParse({ barcode: "1".repeat(20) }).success,
    ).toBe(true);
  });
});

describe("searchQuerySchema", () => {
  it("defaults page to 1 when absent", () => {
    const result = searchQuerySchema.parse({ q: "milk" });
    expect(result).toEqual({ q: "milk", page: 1 });
  });

  it("coerces the page string from the query string to a number", () => {
    const result = searchQuerySchema.parse({ q: "milk", page: "3" });
    expect(result.page).toBe(3);
  });

  it("trims the query and accepts the 60-char boundary", () => {
    expect(searchQuerySchema.parse({ q: "  חלב  " }).q).toBe("חלב");
    expect(searchQuerySchema.safeParse({ q: "א".repeat(60) }).success).toBe(
      true,
    );
  });

  it.each([
    ["empty q", { q: "" }],
    ["whitespace-only q", { q: "   " }],
    ["q longer than 60 chars", { q: "a".repeat(61) }],
    ["page 0", { q: "milk", page: "0" }],
    ["negative page", { q: "milk", page: "-2" }],
    ["fractional page", { q: "milk", page: "1.5" }],
    ["non-numeric page", { q: "milk", page: "abc" }],
  ])("rejects %s", (_label, input) => {
    expect(searchQuerySchema.safeParse(input).success).toBe(false);
  });
});

describe("addToFridgeSchema", () => {
  it("accepts a valid productId with units in range", () => {
    const result = addToFridgeSchema.parse({
      productId: VALID_UUID,
      units: 3,
    });
    expect(result).toEqual({ productId: VALID_UUID, units: 3 });
  });

  it("accepts the 1 and 20 unit boundaries", () => {
    expect(
      addToFridgeSchema.safeParse({ productId: VALID_UUID, units: 1 }).success,
    ).toBe(true);
    expect(
      addToFridgeSchema.safeParse({ productId: VALID_UUID, units: 20 }).success,
    ).toBe(true);
  });

  it.each([
    ["a non-UUID productId", { productId: "not-a-uuid", units: 1 }],
    ["zero units", { productId: VALID_UUID, units: 0 }],
    ["more than 20 units", { productId: VALID_UUID, units: 21 }],
    ["fractional units", { productId: VALID_UUID, units: 1.5 }],
    ["missing units", { productId: VALID_UUID }],
  ])("rejects %s", (_label, input) => {
    expect(addToFridgeSchema.safeParse(input).success).toBe(false);
  });
});

describe("setRemainingSchema", () => {
  it.each([0, 25, 50, 75, 100] as const)(
    "accepts the valid level %d",
    (level) => {
      const result = setRemainingSchema.parse({
        itemId: VALID_UUID,
        remainingPercent: level,
      });
      expect(result.remainingPercent).toBe(level);
    },
  );

  it.each([
    ["an off-scale level", { itemId: VALID_UUID, remainingPercent: 10 }],
    ["a negative level", { itemId: VALID_UUID, remainingPercent: -25 }],
    ["a string level", { itemId: VALID_UUID, remainingPercent: "50" }],
    ["a non-UUID itemId", { itemId: "abc", remainingPercent: 50 }],
  ])("rejects %s", (_label, input) => {
    expect(setRemainingSchema.safeParse(input).success).toBe(false);
  });
});

describe("deleteItemSchema / restockItemSchema", () => {
  it("accept a valid itemId", () => {
    expect(deleteItemSchema.safeParse({ itemId: VALID_UUID }).success).toBe(
      true,
    );
    expect(restockItemSchema.safeParse({ itemId: VALID_UUID }).success).toBe(
      true,
    );
  });

  it("reject a non-UUID itemId", () => {
    expect(deleteItemSchema.safeParse({ itemId: "1234" }).success).toBe(false);
    expect(restockItemSchema.safeParse({ itemId: "1234" }).success).toBe(false);
  });
});

describe("createManualProductSchema", () => {
  it("accepts the minimal manual product (name + category only)", () => {
    const result = createManualProductSchema.parse({
      name: "גבינה לבנה",
      category: "Dairy",
    });
    expect(result).toEqual({ name: "גבינה לבנה", category: "Dairy" });
  });

  it("accepts a fully specified manual product", () => {
    const result = createManualProductSchema.parse({
      name: "Cottage 5%",
      barcode: "7290000000001",
      brand: "Tnuva",
      packageSize: "250 g",
      category: "Dairy",
      addUnits: 2,
    });
    expect(result.addUnits).toBe(2);
  });

  it("trims the name and accepts the 80-char boundary", () => {
    expect(
      createManualProductSchema.parse({ name: "  Milk  ", category: "Other" })
        .name,
    ).toBe("Milk");
    expect(
      createManualProductSchema.safeParse({
        name: "a".repeat(80),
        category: "Other",
      }).success,
    ).toBe(true);
  });

  it.each([
    ["a whitespace-only name", { name: "   ", category: "Other" }],
    ["a name over 80 chars", { name: "a".repeat(81), category: "Other" }],
    ["a category outside the taxonomy", { name: "Milk", category: "Candy" }],
    ["a missing category", { name: "Milk" }],
    // Forms must map empty optional inputs to undefined before parsing —
    // empty strings are contract violations, not silently-dropped values.
    [
      "an empty-string barcode",
      { name: "Milk", category: "Other", barcode: "" },
    ],
    ["an empty-string brand", { name: "Milk", category: "Other", brand: "" }],
    ["zero addUnits", { name: "Milk", category: "Other", addUnits: 0 }],
    ["addUnits over 20", { name: "Milk", category: "Other", addUnits: 21 }],
  ])("rejects %s", (_label, input) => {
    expect(createManualProductSchema.safeParse(input).success).toBe(false);
  });
});

describe("fieldErrorsOf", () => {
  it("groups issue messages by dotted field path", () => {
    const result = createManualProductSchema.safeParse({
      name: "",
      category: "Candy",
    });
    expect(result.success).toBe(false);
    if (result.success) return;

    const fieldErrors = fieldErrorsOf(result.error);
    expect(Object.keys(fieldErrors).sort()).toEqual(["category", "name"]);
    expect(fieldErrors.name?.length).toBeGreaterThan(0);
  });
});

/* ─── Contract alignment: schema outputs ≡ frozen input types ─────────────────
 * Compile-time-only assertions (checked by `tsc --noEmit` and vitest). If a
 * schema drifts from its frozen type in src/lib/types.ts, typecheck fails.
 */
describe("schema outputs match the frozen server-action input types", () => {
  it("stays aligned (compile-time assertions)", () => {
    expectTypeOf<
      z.output<typeof addToFridgeSchema>
    >().toEqualTypeOf<AddToFridgeInput>();
    expectTypeOf<
      z.output<typeof setRemainingSchema>
    >().toEqualTypeOf<SetRemainingInput>();
    expectTypeOf<
      z.output<typeof deleteItemSchema>
    >().toEqualTypeOf<DeleteItemInput>();
    expectTypeOf<
      z.output<typeof restockItemSchema>
    >().toEqualTypeOf<RestockItemInput>();
    expectTypeOf<
      z.output<typeof createManualProductSchema>
    >().toEqualTypeOf<CreateManualProductInput>();
  });
});
