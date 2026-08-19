/**
 * Fridge inventory snapshot for one chat turn — the privacy boundary between
 * the user's data and AI vendors.
 *
 * Only recipe-relevant fields are serialized: product name, brand, package
 * size, category, per-unit remaining percentage. Database UUIDs are replaced
 * by opaque per-turn refs ("item_3"); user ids, emails, timestamps, image
 * URLs, and lineage never reach a provider.
 *
 * The snapshot is taken once per turn and is immutable: a failover replays
 * the exact same context to the next provider.
 */

import type { FridgeItemWithLineage } from "@/lib/v2/types";

import type { AIFridgeUnit, SnapshotItem, TurnInventory } from "./types";

/**
 * Narrows the frozen `AICompletionRequest.fridge` element to a unit that
 * actually carries its product embed (see src/lib/ai/types.ts for the
 * documented contract gap).
 */
export function hasProduct(item: FridgeItemWithLineage): item is AIFridgeUnit {
  if (!("product" in item)) return false;
  const product = (item as AIFridgeUnit).product;
  return (
    typeof product === "object" &&
    product !== null &&
    typeof product.name === "string"
  );
}

/**
 * Builds the per-turn inventory: live units only (remaining > 0), ordered
 * stably (added_at, then id — same total order as the fridge page) so refs
 * are deterministic for a given snapshot.
 */
export function buildTurnInventory(units: AIFridgeUnit[]): TurnInventory {
  const live = [...units]
    .filter((unit) => unit.remainingPercent > 0)
    .sort((a, b) => {
      if (a.addedAt !== b.addedAt) return a.addedAt < b.addedAt ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  const items: SnapshotItem[] = live.map((unit, index) => ({
    ref: `item_${index + 1}`,
    itemId: unit.id,
    name: unit.product.name,
    brand: unit.product.brand,
    packageSize: unit.product.packageSize,
    category: unit.product.category,
    remainingPercent: unit.remainingPercent,
  }));

  return {
    items,
    byRef: new Map(items.map((item) => [item.ref, item])),
    byItemId: new Map(items.map((item) => [item.itemId, item])),
  };
}

/** Model-facing JSON shape for tool results (no UUIDs by construction). */
export interface SerializedSnapshotItem {
  ref: string;
  name: string;
  brand?: string;
  packageSize?: string;
  category: string;
  remainingPercent: number;
}

export function serializeItemsForTool(
  items: SnapshotItem[],
): SerializedSnapshotItem[] {
  return items.map((item) => ({
    ref: item.ref,
    name: item.name,
    ...(item.brand ? { brand: item.brand } : {}),
    ...(item.packageSize ? { packageSize: item.packageSize } : {}),
    category: item.category,
    remainingPercent: item.remainingPercent,
  }));
}

/** Compact plain-text rendering for the system prompt. */
export function serializeInventoryForModel(inventory: TurnInventory): string {
  if (inventory.items.length === 0) {
    return "The fridge is empty (no live units).";
  }
  return inventory.items
    .map((item) => {
      const details = [item.brand, item.packageSize].filter(Boolean).join(", ");
      const label = details ? `${item.name} (${details})` : item.name;
      return `- ${item.ref}: ${label} — ${item.category} — ${item.remainingPercent}% remaining`;
    })
    .join("\n");
}

/**
 * Simple token match over name/brand/category. All query tokens must appear
 * somewhere in the unit's text. Case-insensitive; works for Hebrew (no case).
 */
export function findMatches(
  inventory: TurnInventory,
  query: string,
): SnapshotItem[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  return inventory.items.filter((item) => {
    const haystack = [item.name, item.brand ?? "", item.category]
      .join(" ")
      .toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}
