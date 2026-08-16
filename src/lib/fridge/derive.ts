/**
 * Fridge derivations — pure functions, no I/O, no Next.js imports
 * (docs/TECHNICAL_DESIGN.md §8). Low/finished/restock state is always
 * DERIVED at read time, never stored (docs/IMPLEMENTATION_PLAN.md §13).
 */

import { CATEGORIES } from "@/lib/types";
import type { Category, FridgeItem, Product, RemainingLevel } from "@/lib/types";

import { LEVEL_LABELS, relativeTime } from "./format";

/** One physical fridge unit joined to its catalog product. */
export interface FridgeUnit extends FridgeItem {
  product: Product;
}

/* ─── Stock state (approved rules) ────────────────────────────────────────── */

/** Approved low-stock rule: remaining ≤ 25 AND not finished. */
export const LOW_STOCK_THRESHOLD = 25;

/** Approved "finished recently" window for the restock view. */
export const RECENTLY_FINISHED_DAYS = 14;

/**
 * Structural subset of FridgeItem with remainingPercent deliberately widened
 * to number, so boundary values outside the five-level model (e.g. 26) are
 * expressible in tests.
 */
interface StockState {
  remainingPercent: number;
  finishedAt: string | null;
}

/** `remaining_percent <= 25 AND finished_at IS NULL` — 25 is low, 26 is not. */
export function isLow(unit: StockState): boolean {
  return unit.remainingPercent <= LOW_STOCK_THRESHOLD && unit.finishedAt === null;
}

/** `remaining_percent = 0 AND finished_at != NULL`. */
export function isFinished(unit: StockState): boolean {
  return unit.remainingPercent === 0 && unit.finishedAt !== null;
}

/** A unit still counted in the live fridge (not finished). */
export function isLive(unit: StockState): boolean {
  return unit.finishedAt === null;
}

/* ─── Fridge filters (All / Low / Finished) ───────────────────────────────── */

export type FridgeFilter = "all" | "low" | "finished";

/** Parses the `?filter=` search param; anything unknown falls back to "all". */
export function parseFridgeFilter(value: unknown): FridgeFilter {
  return value === "low" || value === "finished" ? value : "all";
}

export function filterUnits(
  units: FridgeUnit[],
  filter: FridgeFilter,
): FridgeUnit[] {
  switch (filter) {
    case "low":
      return units.filter(isLow);
    case "finished":
      return units.filter(isFinished);
    default:
      return units.filter(isLive);
  }
}

export interface FridgeSummary {
  /** Live (unfinished) units. */
  items: number;
  low: number;
  finished: number;
}

export function summarizeUnits(units: FridgeUnit[]): FridgeSummary {
  return {
    items: units.filter(isLive).length,
    low: units.filter(isLow).length,
    finished: units.filter(isFinished).length,
  };
}

/* ─── Grouping (docs/TECHNICAL_DESIGN.md §8.3) ────────────────────────────── */

/**
 * A unit paired with its stable per-product number ("Unit 2"). Numbers follow
 * added-at order so they do not shuffle when levels change.
 */
export interface NumberedUnit {
  unit: FridgeUnit;
  unitNumber: number;
}

export interface ProductGroup {
  product: Product;
  /** Display order: fullest first, then oldest first (UI_DESIGN §6.3). */
  units: NumberedUnit[];
}

export interface CategoryGroup {
  category: Category;
  groups: ProductGroup[];
  /** Total physical units in the category (the "DAIRY · 4" count). */
  unitCount: number;
}

/**
 * Groups physical rows by product while retaining each row's identity —
 * every chip the UI renders corresponds to exactly one fridge_items row.
 */
export function groupByProduct(units: FridgeUnit[]): ProductGroup[] {
  const byProduct = new Map<string, FridgeUnit[]>();
  for (const unit of units) {
    const existing = byProduct.get(unit.productId);
    if (existing) {
      existing.push(unit);
    } else {
      byProduct.set(unit.productId, [unit]);
    }
  }

  const groups: ProductGroup[] = [];
  for (const productUnits of byProduct.values()) {
    // Stable identity: number units by when they entered the fridge.
    const byAge = [...productUnits].sort(
      (a, b) => Date.parse(a.addedAt) - Date.parse(b.addedAt),
    );
    const numbered = byAge.map((unit, index) => ({
      unit,
      unitNumber: index + 1,
    }));
    // Display order: fullest first; age breaks ties.
    numbered.sort(
      (a, b) =>
        b.unit.remainingPercent - a.unit.remainingPercent ||
        a.unitNumber - b.unitNumber,
    );
    groups.push({ product: productUnits[0].product, units: numbered });
  }

  // Products alphabetically within a category (Hebrew-aware compare).
  groups.sort((a, b) => a.product.name.localeCompare(b.product.name));
  return groups;
}

/**
 * Fixed-taxonomy category sections, in taxonomy order, skipping empty
 * categories (they are never rendered).
 */
export function groupInventory(units: FridgeUnit[]): CategoryGroup[] {
  const groups = groupByProduct(units);
  const sections: CategoryGroup[] = [];
  for (const category of CATEGORIES) {
    const inCategory = groups.filter(
      (group) => group.product.category === category,
    );
    if (inCategory.length === 0) continue;
    sections.push({
      category,
      groups: inCategory,
      unitCount: inCategory.reduce((sum, group) => sum + group.units.length, 0),
    });
  }
  return sections;
}

/* ─── Restock derivations (docs/TECHNICAL_DESIGN.md §8.2) ─────────────────── */

export interface RestockEntry {
  /** The fridge item the one-tap restock action references. */
  itemId: string;
  product: Product;
  remainingPercent: RemainingLevel;
  finishedAt: string | null;
}

/** Live units at ≤ 25% — one row per physical unit, lowest/oldest first. */
export function deriveRunningLow(units: FridgeUnit[]): RestockEntry[] {
  return units
    .filter(isLow)
    .sort(
      (a, b) =>
        a.remainingPercent - b.remainingPercent ||
        Date.parse(a.addedAt) - Date.parse(b.addedAt),
    )
    .map((unit) => ({
      itemId: unit.id,
      product: unit.product,
      remainingPercent: unit.remainingPercent,
      finishedAt: unit.finishedAt,
    }));
}

/**
 * Products finished within the last 14 days, shown only while the user holds
 * NO live unit of that product — restocking naturally removes the row
 * (docs/TECHNICAL_DESIGN.md §8.2). One row per product; when several units of
 * the same product finished, the most recently finished one represents it
 * (and is the item the restock action references). Newest first.
 */
export function deriveFinishedRecently(
  units: FridgeUnit[],
  now: Date,
): RestockEntry[] {
  const cutoff = now.getTime() - RECENTLY_FINISHED_DAYS * 24 * 60 * 60 * 1000;
  const liveProductIds = new Set(
    units.filter(isLive).map((unit) => unit.productId),
  );

  const latestPerProduct = new Map<string, FridgeUnit>();
  for (const unit of units) {
    if (!isFinished(unit)) continue;
    const finishedAtMs = Date.parse(unit.finishedAt as string);
    if (finishedAtMs < cutoff || finishedAtMs > now.getTime() + 60_000) continue;
    if (liveProductIds.has(unit.productId)) continue;
    const current = latestPerProduct.get(unit.productId);
    if (!current || finishedAtMs > Date.parse(current.finishedAt as string)) {
      latestPerProduct.set(unit.productId, unit);
    }
  }

  return [...latestPerProduct.values()]
    .sort(
      (a, b) =>
        Date.parse(b.finishedAt as string) - Date.parse(a.finishedAt as string),
    )
    .map((unit) => ({
      itemId: unit.id,
      product: unit.product,
      remainingPercent: unit.remainingPercent,
      finishedAt: unit.finishedAt,
    }));
}

/* ─── Recent-activity feed ────────────────────────────────────────────────── */

/** A consumption event joined to its product name (query-layer shape). */
export interface ActivityEvent {
  id: string;
  deltaPercent: number;
  remainingAfter: RemainingLevel;
  createdAt: string;
  productName: string;
}

export type ActivityDirection = "consumed" | "restored";

/** A humanized activity row: icon direction + "שם מוצר → ½ · 2h ago". */
export interface ActivityEntry {
  id: string;
  direction: ActivityDirection;
  productName: string;
  levelLabel: string;
  relativeLabel: string;
}

/**
 * Humanizes raw consumption events. Negative delta = consumed, positive =
 * restored/corrected upward (the frozen signed-event convention). Zero-delta
 * rows (which the actions never write) are dropped as meaningless.
 */
export function deriveActivity(
  events: ActivityEvent[],
  now: Date,
): ActivityEntry[] {
  return events
    .filter((event) => event.deltaPercent !== 0)
    .map((event) => ({
      id: event.id,
      direction: (event.deltaPercent < 0
        ? "consumed"
        : "restored") as ActivityDirection,
      productName: event.productName,
      levelLabel: LEVEL_LABELS[event.remainingAfter],
      relativeLabel: relativeTime(event.createdAt, now),
    }));
}
