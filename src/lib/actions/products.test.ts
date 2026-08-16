import { beforeEach, describe, expect, it, vi } from "vitest";

import { revalidatePath } from "next/cache";

import { createManualProduct } from "./products";
import {
  createSupabaseStub,
  type ProgrammedResponse,
  type SupabaseStub,
} from "./test-stubs";

let stub: SupabaseStub;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => stub.client,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";

const PRODUCT_ROW = {
  id: "44444444-4444-4444-8444-444444444444",
  barcode: "7290000066318",
  name: "קוטג' תנובה 5%",
  brand: "תנובה",
  package_size: "250 g",
  category: "Dairy",
  image_url: null,
  source: "user",
};

function authed(responses: ProgrammedResponse[] = []) {
  stub = createSupabaseStub({ user: { id: USER_ID }, responses });
}

beforeEach(() => {
  vi.clearAllMocks();
  authed();
});

describe("createManualProduct", () => {
  it("rejects unauthenticated callers", async () => {
    stub = createSupabaseStub({ user: null });
    const result = await createManualProduct({
      name: "Milk",
      category: "Dairy",
    });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "unauthenticated" }),
    });
  });

  it("requires a non-empty name (frozen schema)", async () => {
    const result = await createManualProduct({ name: "", category: "Dairy" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation");
      expect(result.error.fieldErrors?.name).toBeDefined();
    }
  });

  it("rejects a barcode that fails classification, as a field error", async () => {
    const result = await createManualProduct({
      name: "Milk",
      category: "Dairy",
      barcode: "abc",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation");
      expect(result.error.fieldErrors?.barcode).toBeDefined();
    }
    expect(stub.calls).toHaveLength(0);
  });

  it("creates a source='user' product owned by the caller", async () => {
    authed([
      { table: "products", op: "insert", result: { data: PRODUCT_ROW } },
    ]);

    const result = await createManualProduct({
      name: "קוטג' תנובה 5%",
      brand: "תנובה",
      packageSize: "250 g",
      category: "Dairy",
      barcode: "729-0000066318", // separators stripped by classification
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.existed).toBe(false);
      expect(result.data.product.name).toBe("קוטג' תנובה 5%");
      expect(result.data.product.packageSize).toBe("250 g");
      expect(result.data.itemIds).toEqual([]);
    }
    const insert = stub.calls.find((call) => call.table === "products");
    expect(insert?.values).toMatchObject({
      source: "user",
      created_by: USER_ID,
      barcode: "7290000066318",
      brand: "תנובה",
      package_size: "250 g",
    });
  });

  it("returns the existing product when the barcode is already cataloged", async () => {
    authed([
      {
        table: "products",
        op: "insert",
        result: { error: { code: "23505", message: "duplicate" } },
      },
      { table: "products", op: "select", result: { data: PRODUCT_ROW } },
    ]);

    const result = await createManualProduct({
      name: "Whatever the user typed",
      category: "Other",
      barcode: "7290000066318",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.existed).toBe(true);
      expect(result.data.product.id).toBe(PRODUCT_ROW.id);
    }
  });

  it("adds fridge units in the same action when addUnits is set", async () => {
    authed([
      { table: "products", op: "insert", result: { data: PRODUCT_ROW } },
      {
        table: "fridge_items",
        op: "insert",
        result: { data: [{ id: "u1" }, { id: "u2" }] },
      },
    ]);

    const result = await createManualProduct({
      name: "קוטג' תנובה 5%",
      category: "Dairy",
      addUnits: 2,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.itemIds).toEqual(["u1", "u2"]);

    const fridgeInsert = stub.calls.find(
      (call) => call.table === "fridge_items" && call.op === "insert",
    );
    expect(fridgeInsert?.values).toEqual([
      {
        user_id: USER_ID,
        product_id: PRODUCT_ROW.id,
        remaining_percent: 100,
      },
      {
        user_id: USER_ID,
        product_id: PRODUCT_ROW.id,
        remaining_percent: 100,
      },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/fridge");
    expect(revalidatePath).toHaveBeenCalledWith("/restock");
    expect(revalidatePath).toHaveBeenCalledWith("/add");
  });
});
