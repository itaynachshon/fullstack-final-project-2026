"use server";

/**
 * Fridge mutations — FROZEN SIGNATURES (end of Wave 1).
 *
 * Contract per docs/TECHNICAL_DESIGN.md §6.4: every action follows
 *   auth check → Zod parse → DB write under RLS → revalidatePath → ActionResult
 * and never throws across the client boundary.
 *
 * Wave 1 status: auth check and validation are real; the database writes are
 * implemented in Wave 2 by Agent B WITHOUT changing these signatures or the
 * ActionResult shapes. Until then, valid calls report an 'internal'
 * not-implemented error.
 */

import {
  addToFridgeSchema,
  deleteItemSchema,
  fieldErrorsOf,
  restockItemSchema,
  setRemainingSchema,
} from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import type {
  ActionResult,
  AddToFridgeData,
  AddToFridgeInput,
  DeleteItemData,
  DeleteItemInput,
  RestockItemData,
  RestockItemInput,
  SetRemainingData,
  SetRemainingInput,
} from "@/lib/types";
import type { z } from "zod";

/** Inserts `units` fridge_items rows at 100% for the given product. */
export async function addToFridge(
  input: AddToFridgeInput,
): Promise<ActionResult<AddToFridgeData>> {
  const gate = await requireUserAndParse(addToFridgeSchema, input);
  if (!gate.ok) return gate.failure;
  return notImplemented();
}

/**
 * Sets a unit's absolute remaining level; stamps/clears finished_at at 0;
 * writes the signed-delta consumption event; idempotent when unchanged.
 */
export async function setRemaining(
  input: SetRemainingInput,
): Promise<ActionResult<SetRemainingData>> {
  const gate = await requireUserAndParse(setRemainingSchema, input);
  if (!gate.ok) return gate.failure;
  return notImplemented();
}

/** Hard-deletes a fridge item; its consumption events cascade. */
export async function deleteItem(
  input: DeleteItemInput,
): Promise<ActionResult<DeleteItemData>> {
  const gate = await requireUserAndParse(deleteItemSchema, input);
  if (!gate.ok) return gate.failure;
  return notImplemented();
}

/** Inserts a fresh 100% unit for the product of a finished item. */
export async function restockItem(
  input: RestockItemInput,
): Promise<ActionResult<RestockItemData>> {
  const gate = await requireUserAndParse(restockItemSchema, input);
  if (!gate.ok) return gate.failure;
  return notImplemented();
}

/* ─── Shared internals ('use server' files may only export async actions) ─── */

type Gate<T> =
  { ok: true; data: T } | { ok: false; failure: ActionResult<never> };

async function requireUserAndParse<S extends z.ZodType>(
  schema: S,
  input: unknown,
): Promise<Gate<z.infer<S>>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      failure: {
        ok: false,
        error: {
          code: "unauthenticated",
          message: "You must be signed in to do that.",
        },
      },
    };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      failure: {
        ok: false,
        error: {
          code: "validation",
          message: "Invalid input.",
          fieldErrors: fieldErrorsOf(parsed.error),
        },
      },
    };
  }

  return { ok: true, data: parsed.data };
}

function notImplemented(): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "internal",
      message: "Not implemented yet — arrives with Wave 2 (Agent B).",
    },
  };
}
