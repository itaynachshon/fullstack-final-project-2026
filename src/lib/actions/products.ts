"use server";

/**
 * Product mutations — FROZEN SIGNATURE (end of Wave 1), real body (Wave 2).
 *
 * Contract per docs/TECHNICAL_DESIGN.md §6.4 (createManualProduct):
 * inserts a source='user' product owned by the caller; a barcode conflict is
 * NOT an error (the existing product is returned with existed=true); optional
 * addUnits also inserts fridge rows in the same action.
 *
 * Barcode classification uses the canonical barcode domain module
 * (src/lib/barcode/ — normalization, check digit, RCN detection), the single
 * implementation shared by the lookup chain and every form.
 */

import { revalidatePath } from "next/cache";

import { classifyBarcode } from "@/lib/barcode";
import { mapProductRow, type ProductRow } from "@/lib/fridge/mappers";
import { ROUTES } from "@/lib/routes";
import { createManualProductSchema, fieldErrorsOf } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import type {
  ActionResult,
  CreateManualProductData,
  CreateManualProductInput,
  Product,
} from "@/lib/types";

/** Postgres unique-violation code (the partial unique index on barcode). */
const UNIQUE_VIOLATION = "23505";

const PRODUCT_SELECT =
  "id, barcode, name, brand, package_size, category, image_url, source";

export async function createManualProduct(
  input: CreateManualProductInput,
): Promise<ActionResult<CreateManualProductData>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: {
        code: "unauthenticated",
        message: "You must be signed in to do that.",
      },
    };
  }

  const parsed = createManualProductSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation",
        message: "Invalid input.",
        fieldErrors: fieldErrorsOf(parsed.error),
      },
    };
  }

  // Optional barcode must classify as a GTIN (store-internal codes are not a
  // stable product identity and are never stored — docs/TECHNICAL_DESIGN.md §4.4).
  let barcode: string | null = null;
  if (parsed.data.barcode !== undefined) {
    const classification = classifyBarcode(parsed.data.barcode);
    if (classification.kind === "invalid") {
      return validationError("barcode", classification.reason);
    }
    if (classification.kind === "rcn") {
      return validationError(
        "barcode",
        "That's a store-printed code for weighed items — leave the barcode empty.",
      );
    }
    barcode = classification.canonical;
  }

  const { data: created, error: insertError } = await supabase
    .from("products")
    .insert({
      barcode,
      name: parsed.data.name,
      brand: parsed.data.brand ?? null,
      package_size: parsed.data.packageSize ?? null,
      category: parsed.data.category,
      image_url: null,
      source: "user",
      created_by: user.id,
    })
    .select(PRODUCT_SELECT)
    .single();

  let product: Product;
  let existed = false;

  if (insertError) {
    // Barcode already in the shared catalog: someone was faster — that is the
    // catalog working, not an error. Use the existing product.
    if (insertError.code === UNIQUE_VIOLATION && barcode) {
      const { data: existing, error: selectError } = await supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("barcode", barcode)
        .maybeSingle();
      if (selectError || !existing) {
        return internal("createManualProduct re-select failed", selectError);
      }
      product = mapProductRow(existing as ProductRow);
      existed = true;
    } else {
      return internal("createManualProduct insert failed", insertError);
    }
  } else {
    product = mapProductRow(created as ProductRow);
  }

  // Optionally add the product straight to the fridge in the same action.
  let itemIds: string[] = [];
  if (parsed.data.addUnits) {
    const rows = Array.from({ length: parsed.data.addUnits }, () => ({
      user_id: user.id,
      product_id: product.id,
      remaining_percent: 100,
    }));
    const { data: inserted, error: fridgeError } = await supabase
      .from("fridge_items")
      .insert(rows)
      .select("id");
    if (fridgeError) {
      return internal("createManualProduct fridge insert failed", fridgeError);
    }
    itemIds = (inserted ?? []).map((row: { id: string }) => row.id);
  }

  revalidatePath(ROUTES.fridge);
  revalidatePath(ROUTES.restock);
  revalidatePath(ROUTES.add);

  return { ok: true, data: { product, existed, itemIds } };
}

/* ─── Internals ───────────────────────────────────────────────────────────── */

function validationError(field: string, message: string): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "validation",
      message,
      fieldErrors: { [field]: [message] },
    },
  };
}

function internal(context: string, error: unknown): ActionResult<never> {
  console.error(`${context}:`, error);
  return {
    ok: false,
    error: {
      code: "internal",
      message: "Something went wrong on our side — try again.",
    },
  };
}
