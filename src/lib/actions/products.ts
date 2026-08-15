"use server";

/**
 * Product mutations — FROZEN SIGNATURE (end of Wave 1).
 *
 * Contract per docs/TECHNICAL_DESIGN.md §6.4 (createManualProduct):
 * inserts a source='user' product owned by the caller; a barcode conflict is
 * NOT an error (the existing product is returned with existed=true); optional
 * addUnits also inserts fridge rows in the same action.
 *
 * Wave 1 status: auth check and shape validation are real; barcode GTIN
 * classification (src/lib/barcode/, Agent A) and the database write (Agent B)
 * arrive in Wave 2 WITHOUT changing this signature.
 */

import { createManualProductSchema, fieldErrorsOf } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import type {
  ActionResult,
  CreateManualProductData,
  CreateManualProductInput,
} from "@/lib/types";

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

  return {
    ok: false,
    error: {
      code: "internal",
      message: "Not implemented yet — arrives with Wave 2 (Agent B).",
    },
  };
}
