/**
 * Server-side reads for the item-history feature (F1).
 *
 * The caller (the getItemHistory server action) passes its cookie-bound
 * Supabase client — RLS scopes every query to the signed-in user, so a
 * foreign item id reads as "does not exist" (docs/FEATURES_V2_PLAN.md §7).
 *
 * One history view = exactly three queries, issued in parallel (no N+1):
 *   1. the item row + embedded product (single round trip via the FK embed),
 *   2. that item's consumption events (timeline order: created_at, id),
 *   3. the earliest unit whose restocked_from_item_id points here
 *      (answers "when was this finished unit restocked?" via the partial
 *      index fridge_items_restocked_from_idx).
 */

import type { createClient } from "@/lib/supabase/server";

import type {
  HistoryEventRow,
  HistoryItemRow,
  RestockedByRow,
} from "./mappers";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

const HISTORY_ITEM_SELECT = `
  id, remaining_percent, added_at, finished_at, restocked_from_item_id,
  product:products ( id, barcode, name, brand, package_size, category, image_url, source )
`;

export interface ItemHistoryRows {
  item: HistoryItemRow;
  events: HistoryEventRow[];
  restockedBy: RestockedByRow | null;
}

export type ItemHistoryRowsResult =
  | { ok: true; rows: ItemHistoryRows | null }
  | { ok: false; context: string; error: unknown };

/** `rows: null` means the item is invisible to the caller (missing/foreign). */
export async function fetchItemHistoryRows(
  supabase: ServerSupabase,
  itemId: string,
): Promise<ItemHistoryRowsResult> {
  const [itemRes, eventsRes, restockedByRes] = await Promise.all([
    supabase
      .from("fridge_items")
      .select(HISTORY_ITEM_SELECT)
      .eq("id", itemId)
      .maybeSingle(),
    supabase
      .from("consumption_events")
      .select("id, delta_percent, remaining_after, created_at")
      .eq("fridge_item_id", itemId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("fridge_items")
      .select("id, added_at")
      .eq("restocked_from_item_id", itemId)
      .order("added_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1),
  ]);

  if (itemRes.error) {
    return { ok: false, context: "item read", error: itemRes.error };
  }
  if (eventsRes.error) {
    return { ok: false, context: "events read", error: eventsRes.error };
  }
  if (restockedByRes.error) {
    return {
      ok: false,
      context: "restocked-by read",
      error: restockedByRes.error,
    };
  }

  const item = itemRes.data as unknown as HistoryItemRow | null;
  if (!item) return { ok: true, rows: null };

  const events = (eventsRes.data ?? []) as unknown as HistoryEventRow[];
  const restockedByRows = (restockedByRes.data ??
    []) as unknown as RestockedByRow[];

  return {
    ok: true,
    rows: { item, events, restockedBy: restockedByRows[0] ?? null },
  };
}
