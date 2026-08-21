/**
 * Row → domain mapping for the item-history feature. Pure functions.
 *
 * Reuses the fridge feature's ProductRow mapping (read-only import; that
 * module stays untouched per docs/FEATURES_V2_PLAN.md §5.2). Row shapes match
 * the PostgREST selects in ./queries.ts.
 */

import { mapProductRow, type ProductRow } from "@/lib/fridge/mappers";
import { REMAINING_LEVELS } from "@/lib/types";
import type { RemainingLevel } from "@/lib/types";
import type { ItemHistoryEvent } from "@/lib/v2";

import type { ItemHistorySource } from "./derive";

/* ─── Row shapes (snake_case, as returned by PostgREST) ───────────────────── */

export interface HistoryItemRow {
  id: string;
  remaining_percent: number;
  added_at: string;
  finished_at: string | null;
  restocked_from_item_id: string | null;
  /** PostgREST many-to-one embeds are objects; arrays are tolerated. */
  product: ProductRow | ProductRow[] | null;
}

export interface HistoryEventRow {
  id: string;
  delta_percent: number;
  remaining_after: number;
  created_at: string;
}

export interface RestockedByRow {
  id: string;
  added_at: string;
}

/* ─── Mapping ─────────────────────────────────────────────────────────────── */

function first<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toRemainingLevel(value: number): RemainingLevel {
  return (REMAINING_LEVELS as readonly number[]).includes(value)
    ? (value as RemainingLevel)
    : 0;
}

export function mapHistoryEventRow(row: HistoryEventRow): ItemHistoryEvent {
  return {
    id: row.id,
    deltaPercent: row.delta_percent,
    remainingAfter: toRemainingLevel(row.remaining_after),
    createdAt: row.created_at,
  };
}

/** Returns null when the product embed is missing (cannot happen via the FK). */
export function mapHistorySource(
  itemRow: HistoryItemRow,
  eventRows: HistoryEventRow[],
  restockedByRow: RestockedByRow | null,
): ItemHistorySource | null {
  const productRow = first(itemRow.product);
  if (!productRow) return null;
  return {
    item: {
      id: itemRow.id,
      remainingPercent: toRemainingLevel(itemRow.remaining_percent),
      addedAt: itemRow.added_at,
      finishedAt: itemRow.finished_at,
      restockedFromItemId: itemRow.restocked_from_item_id,
    },
    product: mapProductRow(productRow),
    events: eventRows.map(mapHistoryEventRow),
    restockedBy: restockedByRow
      ? { id: restockedByRow.id, addedAt: restockedByRow.added_at }
      : null,
  };
}
