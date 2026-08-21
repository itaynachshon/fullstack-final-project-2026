import { describe, expect, it } from "vitest";

import type { Product } from "@/lib/types";
import type { ItemHistory } from "@/lib/v2";

import { buildItemHistoryView, levelSummary } from "./history-view";

const NOW = new Date(2026, 7, 18, 20, 0); // 18 Aug 2026, 20:00 local

const PRODUCT: Product = {
  id: "22222222-2222-4222-8222-222222222222",
  barcode: null,
  name: "חלב טרי 3%",
  brand: "Tara",
  packageSize: "1 L",
  category: "Dairy",
  imageUrl: null,
  source: "catalog",
};

/** Local-time ISO helper so expectations hold in any machine time zone. */
function iso(...args: [number, number, number, number, number]): string {
  return new Date(...args).toISOString();
}

function history(overrides?: Partial<ItemHistory>): ItemHistory {
  return {
    itemId: "33333333-3333-4333-8333-333333333333",
    product: PRODUCT,
    remainingPercent: 100,
    addedAt: iso(2026, 7, 15, 8, 0),
    lastConsumedAt: null,
    finishedAt: null,
    restockedFromItemId: null,
    restockedByItemId: null,
    restockedAt: null,
    timeline: [],
    ...overrides,
  };
}

describe("empty state (added-only unit)", () => {
  it("shows only the Added fact and a one-row timeline", () => {
    const view = buildItemHistoryView(history(), { now: NOW });

    expect(view.hasEvents).toBe(false);
    expect(view.facts).toEqual([
      { key: "added", label: "Added", value: "15 Aug 2026, 08:00" },
    ]);
    expect(view.timeline).toEqual([
      {
        key: "added",
        kind: "added",
        text: "Added — Full",
        timeLabel: "15 Aug 2026, 08:00",
      },
    ]);
  });
});

describe("history state (consumed, restored, finished)", () => {
  const full = history({
    remainingPercent: 0,
    lastConsumedAt: iso(2026, 7, 18, 17, 10),
    finishedAt: iso(2026, 7, 18, 17, 10),
    timeline: [
      {
        id: "e1000000-0000-4000-8000-000000000000",
        deltaPercent: 50,
        remainingAfter: 50,
        createdAt: iso(2026, 7, 16, 9, 0),
      },
      {
        id: "e2000000-0000-4000-8000-000000000000",
        deltaPercent: -25,
        remainingAfter: 75,
        createdAt: iso(2026, 7, 17, 12, 30),
      },
      {
        id: "e3000000-0000-4000-8000-000000000000",
        deltaPercent: 75,
        remainingAfter: 0,
        createdAt: iso(2026, 7, 18, 17, 10),
      },
    ],
  });

  it("keeps the timeline oldest-first with Added leading", () => {
    const view = buildItemHistoryView(full, { now: NOW });

    expect(view.hasEvents).toBe(true);
    expect(view.timeline.map((row) => row.text)).toEqual([
      "Added — Full",
      "Consumed — ½",
      "Restored — ¾",
      "Finished",
    ]);
    expect(view.timeline.map((row) => row.kind)).toEqual([
      "added",
      "consumed",
      "restored",
      "finished",
    ]);
  });

  it("distinguishes Consumed/Restored/Finished facts and formats times", () => {
    const view = buildItemHistoryView(full, { now: NOW });

    expect(view.facts).toEqual([
      { key: "added", label: "Added", value: "15 Aug 2026, 08:00" },
      { key: "lastConsumed", label: "Last consumed", value: "Today, 17:10" },
      {
        key: "lastRestored",
        label: "Last restored",
        value: "Yesterday, 12:30",
      },
      { key: "finished", label: "Finished", value: "Today, 17:10" },
    ]);
  });

  it("never renders a UUID anywhere", () => {
    const view = buildItemHistoryView(full, { now: NOW });
    const rendered = [
      ...view.facts.flatMap((fact) => [fact.label, fact.value]),
      ...view.timeline.flatMap((row) => [row.text, row.timeLabel]),
    ].join(" ");
    expect(rendered).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });
});

describe("lineage states", () => {
  it("a finished unit that was restocked shows 'Restocked on'", () => {
    const view = buildItemHistoryView(
      history({
        remainingPercent: 0,
        finishedAt: iso(2026, 7, 17, 20, 0),
        restockedByItemId: "44444444-4444-4444-8444-444444444444",
        restockedAt: iso(2026, 7, 18, 9, 15),
      }),
      { now: NOW },
    );
    expect(view.facts).toContainEqual({
      key: "restocked",
      label: "Restocked on",
      value: "Today, 09:15",
    });
  });

  it("a restocked unit shows a generic origin until the source loads", () => {
    const base = history({
      restockedFromItemId: "55555555-5555-4555-8555-555555555555",
    });

    const pending = buildItemHistoryView(base, {
      now: NOW,
      source: { loaded: false, finishedAt: null },
    });
    expect(pending.facts).toContainEqual({
      key: "origin",
      label: "Origin",
      value: "Restocked from a previous unit",
    });

    const loaded = buildItemHistoryView(base, {
      now: NOW,
      source: { loaded: true, finishedAt: iso(2026, 7, 17, 20, 0) },
    });
    expect(loaded.facts).toContainEqual({
      key: "origin",
      label: "Origin",
      value: "Restocked from a unit finished on 17 Aug 2026",
    });
  });

  it("a source that was never finished keeps the generic origin line", () => {
    const view = buildItemHistoryView(
      history({
        restockedFromItemId: "55555555-5555-4555-8555-555555555555",
      }),
      { now: NOW, source: { loaded: true, finishedAt: null } },
    );
    expect(view.facts).toContainEqual({
      key: "origin",
      label: "Origin",
      value: "Restocked from a previous unit",
    });
  });

  it("missing lineage shows no origin fact at all", () => {
    const view = buildItemHistoryView(history(), { now: NOW });
    expect(view.facts.some((fact) => fact.key === "origin")).toBe(false);
  });
});

describe("levelSummary", () => {
  it("speaks the shared five-level vocabulary", () => {
    expect(levelSummary(100)).toBe("Full");
    expect(levelSummary(50)).toBe("Half remaining");
    expect(levelSummary(0)).toBe("Finished");
  });
});
