"use server";

/**
 * F1 contract — getItemHistory. Stub body; F1 replaces this implementation
 * in this file only (docs/FEATURES_V2_PLAN.md §5.2).
 */

import { notImplemented } from "@/lib/v2/not-implemented";
import { getItemHistorySchema } from "@/lib/v2/schemas";
import type {
  GetItemHistoryInput,
  ItemHistory,
  V2ActionResult,
} from "@/lib/v2/types";

export async function getItemHistory(
  input: GetItemHistoryInput,
): Promise<V2ActionResult<ItemHistory>> {
  const parsed = getItemHistorySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation", message: "Invalid input." },
    };
  }
  return notImplemented("Item history");
}
