/**
 * Item-history derivations (F1) — pure functions, no I/O, no Next.js imports.
 *
 * Everything here is DERIVED from existing rows (docs/FEATURES_V2_PLAN.md §2,
 * "do not duplicate derivable columns"): `fridge_items.added_at` /
 * `finished_at`, the signed `consumption_events` log, and the lineage FK.
 * Sign semantics follow the frozen convention (delta = old − new): positive =
 * points consumed, negative = restored/corrected upward.
 */

import type { Product, RemainingLevel } from "@/lib/types";
import type { ItemHistory, ItemHistoryEvent } from "@/lib/v2";

/** The rows deriveItemHistory assembles — already mapped to domain shapes. */
export interface ItemHistorySource {
  item: {
    id: string;
    remainingPercent: RemainingLevel;
    addedAt: string;
    finishedAt: string | null;
    /** F0 lineage FK; NULL for ordinary adds and pre-migration restocks. */
    restockedFromItemId: string | null;
  };
  product: Product;
  /** This unit's consumption events, any order. */
  events: ItemHistoryEvent[];
  /** Earliest unit whose restocked_from_item_id points at this unit. */
  restockedBy: { id: string; addedAt: string } | null;
}

/** Total order matching the SQL `order by created_at, id` (uuid text order). */
function compareOldestFirst(a: ItemHistoryEvent, b: ItemHistoryEvent): number {
  return (
    Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

/** Timeline order: oldest first (created_at, then id for same-instant rows). */
export function sortTimelineOldestFirst(
  events: ItemHistoryEvent[],
): ItemHistoryEvent[] {
  return [...events].sort(compareOldestFirst);
}

/** Summary order: newest first — used to find the latest matching event. */
export function sortEventsNewestFirst(
  events: ItemHistoryEvent[],
): ItemHistoryEvent[] {
  return [...events].sort((a, b) => compareOldestFirst(b, a));
}

/**
 * When the unit was last CONSUMED: the newest event with delta_percent > 0.
 * Restorations (negative deltas) never count as consumption.
 */
export function latestConsumedAt(events: ItemHistoryEvent[]): string | null {
  const latest = sortEventsNewestFirst(events).find(
    (event) => event.deltaPercent > 0,
  );
  return latest?.createdAt ?? null;
}

/**
 * When the unit was last RESTORED/corrected upward: the newest event with
 * delta_percent < 0. Null when every event is a consumption.
 */
export function latestRestoredAt(events: ItemHistoryEvent[]): string | null {
  const latest = sortEventsNewestFirst(events).find(
    (event) => event.deltaPercent < 0,
  );
  return latest?.createdAt ?? null;
}

/**
 * Assembles the frozen ItemHistory shape. No fact here is stored twice:
 * added/finished come from the item row, consumption facts from the event
 * log, and restock lineage from the FK in both directions.
 */
export function deriveItemHistory(source: ItemHistorySource): ItemHistory {
  const { item, product, events, restockedBy } = source;
  return {
    itemId: item.id,
    product,
    remainingPercent: item.remainingPercent,
    addedAt: item.addedAt,
    lastConsumedAt: latestConsumedAt(events),
    finishedAt: item.finishedAt,
    restockedFromItemId: item.restockedFromItemId,
    restockedByItemId: restockedBy?.id ?? null,
    restockedAt: restockedBy?.addedAt ?? null,
    timeline: sortTimelineOldestFirst(events),
  };
}
