/**
 * Server-side reads for the fridge pages. Server Components call these with
 * the cookie-bound Supabase client — RLS scopes every query to the caller,
 * so no user filter appears in code (docs/ARCHITECTURE.md §7).
 *
 * Server-only: imports the cookie-bound client (next/headers). Keep this file
 * out of client components.
 */

import { createClient } from "@/lib/supabase/server";

import type { ActivityEvent, FridgeUnit } from "./derive";
import {
  mapEventRow,
  mapFridgeItemRow,
  type ConsumptionEventRow,
  type FridgeItemRow,
} from "./mappers";

/**
 * Product metadata is embedded in the same query (single round trip — no
 * N+1). The embed follows the fridge_items.product_id FK.
 */
const FRIDGE_ITEM_SELECT = `
  id, user_id, product_id, remaining_percent, added_at, finished_at, updated_at,
  product:products ( id, barcode, name, brand, package_size, category, image_url, source )
`;

/** Every fridge unit of the signed-in user (live and finished), oldest first. */
export async function fetchFridgeUnits(): Promise<FridgeUnit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fridge_items")
    .select(FRIDGE_ITEM_SELECT)
    .order("added_at", { ascending: true })
    // Units added in one action share added_at; without a total order the
    // "Unit N" labels can swap between fetches.
    .order("id", { ascending: true });

  if (error) {
    console.error("fetchFridgeUnits failed:", error);
    throw new Error("Could not load your fridge.");
  }

  return ((data ?? []) as unknown as FridgeItemRow[])
    .map(mapFridgeItemRow)
    .filter((unit): unit is FridgeUnit => unit !== null);
}

/** The latest consumption events with product names, newest first. */
export async function fetchRecentActivity(
  limit = 10,
): Promise<ActivityEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("consumption_events")
    .select(
      `id, delta_percent, remaining_after, created_at,
       fridge_item:fridge_items ( product:products ( name ) )`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("fetchRecentActivity failed:", error);
    throw new Error("Could not load recent activity.");
  }

  return ((data ?? []) as unknown as ConsumptionEventRow[])
    .map(mapEventRow)
    .filter((event): event is ActivityEvent => event !== null);
}
