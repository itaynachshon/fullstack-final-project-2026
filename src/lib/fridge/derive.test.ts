import { describe, expect, it } from "vitest";

import type { Product, RemainingLevel } from "@/lib/types";

import {
  deriveActivity,
  deriveFinishedRecently,
  deriveRunningLow,
  filterUnits,
  groupByProduct,
  groupInventory,
  isFinished,
  isLive,
  isLow,
  parseFridgeFilter,
  summarizeUnits,
  type ActivityEvent,
  type FridgeUnit,
} from "./derive";

/* ─── Fixtures ────────────────────────────────────────────────────────────── */

const NOW = new Date("2026-08-16T12:00:00Z");

let sequence = 0;

function product(overrides: Partial<Product> = {}): Product {
  sequence += 1;
  return {
    id: `product-${sequence}`,
    barcode: null,
    name: `Product ${sequence}`,
    brand: null,
    packageSize: null,
    category: "Other",
    imageUrl: null,
    source: "catalog",
    ...overrides,
  };
}

function unit(
  overrides: Partial<FridgeUnit> & { product?: Product } = {},
): FridgeUnit {
  sequence += 1;
  const p = overrides.product ?? product();
  return {
    id: `item-${sequence}`,
    userId: "user-1",
    productId: p.id,
    remainingPercent: 100,
    addedAt: "2026-08-01T10:00:00Z",
    finishedAt: null,
    updatedAt: "2026-08-01T10:00:00Z",
    ...overrides,
    product: p,
  };
}

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/* ─── Stock state rules (approved boundaries) ─────────────────────────────── */

describe("isLow", () => {
  it("treats 25% as low (boundary inclusive)", () => {
    expect(isLow({ remainingPercent: 25, finishedAt: null })).toBe(true);
  });

  it("treats 26% as not low (boundary exclusive)", () => {
    expect(isLow({ remainingPercent: 26, finishedAt: null })).toBe(false);
  });

  it("never counts finished units as low", () => {
    expect(
      isLow({ remainingPercent: 0, finishedAt: "2026-08-15T00:00:00Z" }),
    ).toBe(false);
  });
});

describe("isFinished", () => {
  it("requires 0% AND a finished_at stamp", () => {
    expect(
      isFinished({ remainingPercent: 0, finishedAt: "2026-08-15T00:00:00Z" }),
    ).toBe(true);
    expect(isFinished({ remainingPercent: 0, finishedAt: null })).toBe(false);
    expect(
      isFinished({ remainingPercent: 25, finishedAt: "2026-08-15T00:00:00Z" }),
    ).toBe(false);
  });
});

describe("isLive", () => {
  it("is the complement of having a finished_at stamp", () => {
    expect(isLive({ remainingPercent: 50, finishedAt: null })).toBe(true);
    expect(
      isLive({ remainingPercent: 0, finishedAt: "2026-08-15T00:00:00Z" }),
    ).toBe(false);
  });
});

/* ─── Filters ─────────────────────────────────────────────────────────────── */

describe("parseFridgeFilter", () => {
  it("accepts the two known filters and falls back to all", () => {
    expect(parseFridgeFilter("low")).toBe("low");
    expect(parseFridgeFilter("finished")).toBe("finished");
    expect(parseFridgeFilter("nonsense")).toBe("all");
    expect(parseFridgeFilter(undefined)).toBe("all");
    expect(parseFridgeFilter(["low"])).toBe("all");
  });
});

describe("filterUnits", () => {
  const live = unit({ remainingPercent: 100 });
  const low = unit({ remainingPercent: 25 });
  const finished = unit({ remainingPercent: 0, finishedAt: daysAgo(1) });
  const all = [live, low, finished];

  it("'all' shows live units only — finished units leave the list", () => {
    expect(filterUnits(all, "all")).toEqual([live, low]);
  });

  it("'low' shows only ≤25% live units", () => {
    expect(filterUnits(all, "low")).toEqual([low]);
  });

  it("'finished' shows only finished units", () => {
    expect(filterUnits(all, "finished")).toEqual([finished]);
  });
});

describe("summarizeUnits", () => {
  it("counts live, low, and finished for the summary sentence", () => {
    const counts = summarizeUnits([
      unit({ remainingPercent: 100 }),
      unit({ remainingPercent: 50 }),
      unit({ remainingPercent: 25 }),
      unit({ remainingPercent: 0, finishedAt: daysAgo(2) }),
    ]);
    expect(counts).toEqual({ items: 3, low: 1, finished: 1 });
  });
});

/* ─── Grouping ────────────────────────────────────────────────────────────── */

describe("groupByProduct", () => {
  it("groups physical rows by product while retaining each row's identity", () => {
    const milk = product({ name: "Milk" });
    const first = unit({ product: milk, addedAt: "2026-08-01T10:00:00Z" });
    const second = unit({ product: milk, addedAt: "2026-08-02T10:00:00Z" });
    const other = unit({});

    const groups = groupByProduct([first, second, other]);
    const milkGroup = groups.find((g) => g.product.id === milk.id);

    expect(groups).toHaveLength(2);
    expect(milkGroup?.units.map(({ unit: u }) => u.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
  });

  it("numbers units by added-at order (stable identity) but displays fullest first", () => {
    const milk = product({ name: "Milk" });
    // Oldest unit is half empty; newest is full.
    const older = unit({
      product: milk,
      addedAt: "2026-08-01T10:00:00Z",
      remainingPercent: 50,
    });
    const newer = unit({
      product: milk,
      addedAt: "2026-08-05T10:00:00Z",
      remainingPercent: 100,
    });

    const [group] = groupByProduct([newer, older]);

    // Display order: fullest first…
    expect(group.units.map(({ unit: u }) => u.id)).toEqual([newer.id, older.id]);
    // …but "Unit 1" stays the oldest row regardless of level.
    expect(
      group.units.find(({ unit: u }) => u.id === older.id)?.unitNumber,
    ).toBe(1);
    expect(
      group.units.find(({ unit: u }) => u.id === newer.id)?.unitNumber,
    ).toBe(2);
  });
});

describe("groupInventory", () => {
  it("orders categories by the fixed taxonomy and skips empty ones", () => {
    const sections = groupInventory([
      unit({ product: product({ category: "Snacks" }) }),
      unit({ product: product({ category: "Dairy" }) }),
      unit({ product: product({ category: "Dairy" }) }),
    ]);

    expect(sections.map((s) => s.category)).toEqual(["Dairy", "Snacks"]);
    expect(sections[0].unitCount).toBe(2);
  });
});

/* ─── Restock derivations ─────────────────────────────────────────────────── */

describe("deriveRunningLow", () => {
  it("returns one row per low physical unit, lowest level first", () => {
    const quarter = unit({ remainingPercent: 25 });
    const half = unit({ remainingPercent: 50 });
    const finished = unit({ remainingPercent: 0, finishedAt: daysAgo(1) });

    const rows = deriveRunningLow([half, quarter, finished]);
    expect(rows.map((r) => r.itemId)).toEqual([quarter.id]);
  });
});

describe("deriveFinishedRecently", () => {
  it("shows products finished within 14 days and drops older ones", () => {
    const recent = unit({ remainingPercent: 0, finishedAt: daysAgo(2) });
    const stale = unit({ remainingPercent: 0, finishedAt: daysAgo(15) });

    const rows = deriveFinishedRecently([recent, stale], NOW);
    expect(rows.map((r) => r.itemId)).toEqual([recent.id]);
  });

  it("hides a product once a live unit exists again (restocked)", () => {
    const milk = product({ name: "Milk" });
    const finished = unit({
      product: milk,
      remainingPercent: 0,
      finishedAt: daysAgo(1),
    });
    const freshRestock = unit({ product: milk, remainingPercent: 100 });

    expect(deriveFinishedRecently([finished, freshRestock], NOW)).toEqual([]);
  });

  it("represents multiple finished units of one product by the most recent, newest products first", () => {
    const milk = product({ name: "Milk" });
    const olderMilk = unit({
      product: milk,
      remainingPercent: 0,
      finishedAt: daysAgo(5),
    });
    const newerMilk = unit({
      product: milk,
      remainingPercent: 0,
      finishedAt: daysAgo(1),
    });
    const juice = unit({ remainingPercent: 0, finishedAt: daysAgo(3) });

    const rows = deriveFinishedRecently([olderMilk, juice, newerMilk], NOW);
    expect(rows.map((r) => r.itemId)).toEqual([newerMilk.id, juice.id]);
  });
});

/* ─── Activity feed ───────────────────────────────────────────────────────── */

describe("deriveActivity", () => {
  function event(
    deltaPercent: number,
    remainingAfter: RemainingLevel,
  ): ActivityEvent {
    sequence += 1;
    return {
      id: `event-${sequence}`,
      deltaPercent,
      remainingAfter,
      createdAt: daysAgo(0.5),
      productName: "חלב טרי 3%",
    };
  }

  // Delta = old − new (plan §12): +50 means "50 points consumed",
  // −25 means "corrected upward / restored by 25 points".
  it("maps positive deltas to consumed and negative to restored", () => {
    const [consumed, restored] = deriveActivity(
      [event(50, 50), event(-25, 25)],
      NOW,
    );
    expect(consumed.direction).toBe("consumed");
    expect(restored.direction).toBe("restored");
  });

  it("humanizes the level and keeps the product name for dir=auto rendering", () => {
    const [entry] = deriveActivity([event(50, 50)], NOW);
    expect(entry.levelLabel).toBe("½");
    expect(entry.productName).toBe("חלב טרי 3%");
    expect(entry.relativeLabel).toBe("12h ago");
  });

  it("drops zero-delta rows as meaningless", () => {
    expect(deriveActivity([event(0, 50)], NOW)).toEqual([]);
  });
});
