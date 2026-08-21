/**
 * Fridge inventory snapshot for one chat turn — the privacy boundary between
 * the user's data and AI vendors.
 *
 * The ORCHESTRATOR builds the snapshot once per turn (`buildTurnInventory`)
 * and keeps the ref → database-id mapping to itself; providers receive only
 * the safe projection (`toInventoryUnits`): opaque per-turn refs ("item_3"),
 * product name, brand, package size, category, and per-unit remaining
 * percentage. Database UUIDs, user ids, emails, timestamps, image URLs, and
 * lineage never enter a provider request.
 *
 * Because the snapshot is taken once and is immutable, a failover replays
 * the exact same refs and context to the next provider.
 */

import type { AIInventoryUnit } from "@/lib/v2/types";

import type {
  AIFridgeUnit,
  ProviderInventory,
  SnapshotItem,
  TurnInventory,
} from "./types";

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
  };
}

/** Safe projection handed to providers — drops the database id entirely. */
export function toInventoryUnits(inventory: TurnInventory): AIInventoryUnit[] {
  return inventory.items.map((item) => ({
    ref: item.ref,
    name: item.name,
    ...(item.brand ? { brand: item.brand } : {}),
    ...(item.packageSize ? { packageSize: item.packageSize } : {}),
    category: item.category,
    remainingPercent: item.remainingPercent,
  }));
}

/** Ref-keyed lookup the provider adapter builds from the safe units. */
export function buildProviderInventory(
  units: AIInventoryUnit[],
): ProviderInventory {
  return {
    units,
    byRef: new Map(units.map((unit) => [unit.ref, unit])),
  };
}

/** Compact plain-text rendering for the system prompt. */
export function serializeInventoryForModel(units: AIInventoryUnit[]): string {
  if (units.length === 0) {
    return "The fridge is empty (no live units).";
  }
  return units
    .map((unit) => {
      const details = [unit.brand, unit.packageSize].filter(Boolean).join(", ");
      const label = details ? `${unit.name} (${details})` : unit.name;
      const category = unit.category ? ` — ${unit.category}` : "";
      return `- ${unit.ref}: ${label}${category} — ${unit.remainingPercent}% remaining`;
    })
    .join("\n");
}

/**
 * Simple token match over name/brand/category. All query tokens must appear
 * somewhere in the unit's text. Case-insensitive; works for Hebrew (no case).
 */
export function findMatches(
  units: AIInventoryUnit[],
  query: string,
): AIInventoryUnit[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  return units.filter((unit) => {
    const haystack = [unit.name, unit.brand ?? "", unit.category ?? ""]
      .join(" ")
      .toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}
