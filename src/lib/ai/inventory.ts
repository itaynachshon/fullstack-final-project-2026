/**
 * Fresh fridge snapshot for one chat turn, read with the caller's RLS
 * client (only their rows are visible). Reuses the frozen fridge mappers;
 * the lineage column is carried to satisfy the frozen
 * `FridgeItemWithLineage` shape even though recipe reasoning ignores it.
 */

import { mapFridgeItemRow, type FridgeItemRow } from "@/lib/fridge/mappers";

import { ConversationStoreError, type DbClient } from "./conversation";
import type { AIFridgeUnit } from "./types";

const AI_FRIDGE_SELECT = `
  id, user_id, product_id, remaining_percent, added_at, finished_at, updated_at,
  restocked_from_item_id,
  product:products ( id, barcode, name, brand, package_size, category, image_url, source )
`;

type AIFridgeRow = FridgeItemRow & {
  restocked_from_item_id?: string | null;
};

/** Live units only (remaining > 0) in the fridge page's stable order. */
export async function loadFridgeUnitsForAI(
  db: DbClient,
): Promise<AIFridgeUnit[]> {
  const { data, error } = await db
    .from("fridge_items")
    .select(AI_FRIDGE_SELECT)
    .order("added_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new ConversationStoreError("load fridge snapshot", error);

  const units: AIFridgeUnit[] = [];
  for (const row of (data ?? []) as unknown as AIFridgeRow[]) {
    if (row.remaining_percent <= 0) continue;
    const unit = mapFridgeItemRow(row);
    if (!unit) continue;
    units.push({
      ...unit,
      restockedFromItemId: row.restocked_from_item_id ?? null,
    });
  }
  return units;
}
