"use server";

/**
 * F1 — getItemHistory. Read-only server action behind the frozen V2 contract
 * (docs/FEATURES_V2_PLAN.md §6.1): auth check → Zod parse → three parallel
 * owner-scoped reads (no N+1) → pure derivation → V2ActionResult.
 *
 * Authorization is RLS with the caller's JWT: a foreign item id reads as
 * empty and is reported as `not_found`, deliberately indistinguishable from
 * "never existed" (same policy as the MVP fridge actions).
 */

import { deriveItemHistory } from "@/lib/history/derive";
import { mapHistorySource } from "@/lib/history/mappers";
import { fetchItemHistoryRows } from "@/lib/history/queries";
import { createClient } from "@/lib/supabase/server";
import { getItemHistorySchema } from "@/lib/v2/schemas";
import type {
  GetItemHistoryInput,
  ItemHistory,
  V2ActionResult,
} from "@/lib/v2/types";

export async function getItemHistory(
  input: GetItemHistoryInput,
): Promise<V2ActionResult<ItemHistory>> {
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

  const parsed = getItemHistorySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation", message: "Invalid input." },
    };
  }

  const result = await fetchItemHistoryRows(supabase, parsed.data.itemId);
  if (!result.ok) {
    console.error(`getItemHistory ${result.context} failed:`, result.error);
    return {
      ok: false,
      error: {
        code: "internal",
        message: "Something went wrong on our side — try again.",
      },
    };
  }

  if (!result.rows) {
    return {
      ok: false,
      error: { code: "not_found", message: "That item isn't in your fridge." },
    };
  }

  const source = mapHistorySource(
    result.rows.item,
    result.rows.events,
    result.rows.restockedBy,
  );
  if (!source) {
    // The product embed is FK-guaranteed; a miss is a data problem, not 404.
    console.error(
      `getItemHistory: product embed missing for item ${parsed.data.itemId}`,
    );
    return {
      ok: false,
      error: {
        code: "internal",
        message: "Something went wrong on our side — try again.",
      },
    };
  }

  return { ok: true, data: deriveItemHistory(source) };
}
