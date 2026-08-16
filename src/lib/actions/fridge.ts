"use server";

/**
 * Fridge mutations — FROZEN SIGNATURES (end of Wave 1), real bodies (Wave 2).
 *
 * Contract per docs/TECHNICAL_DESIGN.md §6.4: every action follows
 *   auth check → Zod parse → DB write under RLS → revalidatePath → ActionResult
 * and never throws across the client boundary.
 *
 * Authorization is RLS: queries run with the caller's JWT, so a foreign item
 * is simply invisible — reads return nothing and writes touch zero rows. The
 * actions report that as `not_found`, deliberately indistinguishable from
 * "never existed" (docs/TECHNICAL_DESIGN.md §11.3). Raw database errors are
 * logged server-side and never shown to the user.
 */

import { revalidatePath } from "next/cache";

import { ROUTES } from "@/lib/routes";
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
  RemainingLevel,
  RestockItemData,
  RestockItemInput,
  SetRemainingData,
  SetRemainingInput,
} from "@/lib/types";
import type { z } from "zod";

/** Postgres error codes surfaced through PostgREST. */
const FOREIGN_KEY_VIOLATION = "23503";

/** Inserts `units` fridge_items rows, one row per physical unit, each at 100%. */
export async function addToFridge(
  input: AddToFridgeInput,
): Promise<ActionResult<AddToFridgeData>> {
  const gate = await requireUserAndParse(addToFridgeSchema, input);
  if (!gate.ok) return gate.failure;
  const { supabase, userId, data } = gate;

  const rows = Array.from({ length: data.units }, () => ({
    user_id: userId,
    product_id: data.productId,
    remaining_percent: 100,
  }));

  const { data: inserted, error } = await supabase
    .from("fridge_items")
    .insert(rows)
    .select("id");

  if (error) {
    // A dangling product id violates the FK — the product does not exist.
    if (error.code === FOREIGN_KEY_VIOLATION) {
      return notFound("That product doesn't exist anymore.");
    }
    return internal("addToFridge insert failed", error);
  }

  revalidateFridgeViews({ includeAdd: true });
  return {
    ok: true,
    data: { itemIds: (inserted ?? []).map((row: { id: string }) => row.id) },
  };
}

/**
 * Sets a unit's ABSOLUTE remaining level (not a delta). Idempotent no-op when
 * unchanged; stamps `finished_at` at 0 and clears it when a finished unit is
 * corrected upward; writes the signed consumption event (delta = new − old,
 * negative = consumed) in the same logical operation.
 *
 * Atomicity note: Supabase's REST layer offers no multi-statement transaction
 * without a database function, and the schema is frozen — so the update and
 * the event insert run sequentially, with a best-effort compensating revert
 * of the update if the event insert fails (documented tradeoff; see
 * docs/TECHNICAL_DESIGN.md §3.1 "consumption_events").
 */
export async function setRemaining(
  input: SetRemainingInput,
): Promise<ActionResult<SetRemainingData>> {
  const gate = await requireUserAndParse(setRemainingSchema, input);
  if (!gate.ok) return gate.failure;
  const { supabase, userId, data } = gate;
  const { itemId, remainingPercent } = data;

  const { data: item, error: readError } = await supabase
    .from("fridge_items")
    .select("id, remaining_percent, finished_at")
    .eq("id", itemId)
    .maybeSingle();

  if (readError) return internal("setRemaining read failed", readError);
  if (!item) return notFound("That item isn't in your fridge.");

  const currentLevel = item.remaining_percent as RemainingLevel;
  const finished = remainingPercent === 0;

  // Re-tapping the current level is a successful no-op (double-tap safe).
  if (currentLevel === remainingPercent) {
    return { ok: true, data: { itemId, remainingPercent, finished } };
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("fridge_items")
    .update({
      remaining_percent: remainingPercent,
      // Stamped when the unit hits 0; cleared on any upward correction.
      finished_at: finished ? nowIso : null,
      updated_at: nowIso,
    })
    .eq("id", itemId)
    .select("id");

  if (updateError) return internal("setRemaining update failed", updateError);
  if (!updated || updated.length === 0) {
    return notFound("That item isn't in your fridge.");
  }

  // Signed event: negative = consumed, positive = correction upward.
  const { error: eventError } = await supabase
    .from("consumption_events")
    .insert({
      fridge_item_id: itemId,
      user_id: userId,
      delta_percent: remainingPercent - currentLevel,
      remaining_after: remainingPercent,
    });

  if (eventError) {
    // Best-effort compensation so the item and its log stay consistent.
    const { error: revertError } = await supabase
      .from("fridge_items")
      .update({
        remaining_percent: currentLevel,
        finished_at: item.finished_at,
        updated_at: nowIso,
      })
      .eq("id", itemId);
    if (revertError) {
      console.error("setRemaining compensation failed:", revertError);
    }
    return internal("setRemaining event insert failed", eventError);
  }

  revalidateFridgeViews();
  return { ok: true, data: { itemId, remainingPercent, finished } };
}

/** Hard-deletes a caller-owned fridge item; its events cascade via the FK. */
export async function deleteItem(
  input: DeleteItemInput,
): Promise<ActionResult<DeleteItemData>> {
  const gate = await requireUserAndParse(deleteItemSchema, input);
  if (!gate.ok) return gate.failure;
  const { supabase, data } = gate;

  const { data: deleted, error } = await supabase
    .from("fridge_items")
    .delete()
    .eq("id", data.itemId)
    .select("id");

  if (error) return internal("deleteItem failed", error);
  if (!deleted || deleted.length === 0) {
    return notFound("That item isn't in your fridge.");
  }

  revalidateFridgeViews();
  return { ok: true, data: { itemId: data.itemId } };
}

/**
 * One-tap restock: inserts a FRESH 100% unit for the referenced item's
 * product. The old finished row is preserved as history — never reset or
 * reused (docs/TECHNICAL_DESIGN.md §6.4).
 */
export async function restockItem(
  input: RestockItemInput,
): Promise<ActionResult<RestockItemData>> {
  const gate = await requireUserAndParse(restockItemSchema, input);
  if (!gate.ok) return gate.failure;
  const { supabase, userId, data } = gate;

  const { data: item, error: readError } = await supabase
    .from("fridge_items")
    .select("product_id")
    .eq("id", data.itemId)
    .maybeSingle();

  if (readError) return internal("restockItem read failed", readError);
  if (!item) return notFound("That item isn't in your fridge.");

  const { data: inserted, error: insertError } = await supabase
    .from("fridge_items")
    .insert({
      user_id: userId,
      product_id: item.product_id,
      remaining_percent: 100,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return internal("restockItem insert failed", insertError);
  }

  revalidateFridgeViews();
  return { ok: true, data: { newItemId: inserted.id } };
}

/* ─── Shared internals ('use server' files may only export async actions) ─── */

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

type Gate<T> =
  | { ok: true; data: T; supabase: ServerSupabase; userId: string }
  | { ok: false; failure: ActionResult<never> };

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

  return { ok: true, data: parsed.data, supabase, userId: user.id };
}

function notFound(message: string): ActionResult<never> {
  return { ok: false, error: { code: "not_found", message } };
}

/** Logs the raw error server-side; the user sees only a generic message. */
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

/** Fridge state feeds /fridge and /restock; the add flow confirms against it. */
function revalidateFridgeViews(options?: { includeAdd: boolean }) {
  revalidatePath(ROUTES.fridge);
  revalidatePath(ROUTES.restock);
  if (options?.includeAdd) revalidatePath(ROUTES.add);
}
