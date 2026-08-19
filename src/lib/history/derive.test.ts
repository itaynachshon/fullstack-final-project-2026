import { describe, expect, it } from "vitest";

import type { Product } from "@/lib/types";
import type { ItemHistoryEvent } from "@/lib/v2";

import {
  deriveItemHistory,
  latestConsumedAt,
  latestRestoredAt,
  sortEventsNewestFirst,
  sortTimelineOldestFirst,
  type ItemHistorySource,
} from "./derive";

const PRODUCT: Product = {
  id: "22222222-2222-4222-8222-222222222222",
  barcode: null,
  name: "קוטג' תנובה 5%",
  brand: "Tnuva",
  packageSize: "250 g",
  category: "Dairy",
  imageUrl: null,
  source: "catalog",
};

let eventCounter = 0;

function event(overrides: Partial<ItemHistoryEvent>): ItemHistoryEvent {
  eventCounter += 1;
  return {
    id: `0000000${eventCounter}-0000-4000-8000-000000000000`,
    deltaPercent: 25,
    remainingAfter: 75,
    createdAt: "2026-08-18T10:00:00.000Z",
    ...overrides,
  };
}

function source(overrides?: Partial<ItemHistorySource>): ItemHistorySource {
  return {
    item: {
      id: "33333333-3333-4333-8333-333333333333",
      remainingPercent: 100,
      addedAt: "2026-08-15T08:00:00.000Z",
      finishedAt: null,
      restockedFromItemId: null,
    },
    product: PRODUCT,
    events: [],
    restockedBy: null,
    ...overrides,
  };
}

describe("deriveItemHistory — added-only unit", () => {
  it("derives everything from added_at when nothing has happened yet", () => {
    const history = deriveItemHistory(source());

    expect(history).toMatchObject({
      itemId: "33333333-3333-4333-8333-333333333333",
      product: PRODUCT,
      remainingPercent: 100,
      addedAt: "2026-08-15T08:00:00.000Z",
      lastConsumedAt: null,
      finishedAt: null,
      restockedFromItemId: null,
      restockedByItemId: null,
      restockedAt: null,
      timeline: [],
    });
  });
});

describe("last consumed vs restored (sign semantics)", () => {
  const consumedEarly = event({
    deltaPercent: 25,
    remainingAfter: 75,
    createdAt: "2026-08-16T09:00:00.000Z",
  });
  const consumedLate = event({
    deltaPercent: 50,
    remainingAfter: 25,
    createdAt: "2026-08-17T12:00:00.000Z",
  });
  const restoredLatest = event({
    deltaPercent: -50,
    remainingAfter: 75,
    createdAt: "2026-08-18T07:30:00.000Z",
  });

  it("lastConsumedAt is the latest POSITIVE delta", () => {
    const history = deriveItemHistory(
      source({ events: [consumedEarly, restoredLatest, consumedLate] }),
    );
    expect(history.lastConsumedAt).toBe("2026-08-17T12:00:00.000Z");
  });

  it("a restoration newer than every consumption does NOT become last consumed", () => {
    expect(
      latestConsumedAt([consumedEarly, consumedLate, restoredLatest]),
    ).toBe("2026-08-17T12:00:00.000Z");
  });

  it("latestRestoredAt is the latest NEGATIVE delta", () => {
    expect(
      latestRestoredAt([consumedEarly, restoredLatest, consumedLate]),
    ).toBe("2026-08-18T07:30:00.000Z");
  });

  it("both are null when no event matches their sign", () => {
    expect(latestConsumedAt([restoredLatest])).toBeNull();
    expect(latestRestoredAt([consumedEarly, consumedLate])).toBeNull();
    expect(latestConsumedAt([])).toBeNull();
    expect(latestRestoredAt([])).toBeNull();
  });
});

describe("timeline ordering", () => {
  it("sorts oldest-first by created_at, breaking same-instant ties by id", () => {
    const later = event({ createdAt: "2026-08-17T10:00:00.000Z" });
    const earlier = event({ createdAt: "2026-08-16T10:00:00.000Z" });
    const tieA = {
      ...event({ createdAt: "2026-08-18T10:00:00.000Z" }),
      id: "aaaaaaaa-0000-4000-8000-000000000000",
    };
    const tieB = {
      ...event({ createdAt: "2026-08-18T10:00:00.000Z" }),
      id: "bbbbbbbb-0000-4000-8000-000000000000",
    };

    const timeline = sortTimelineOldestFirst([tieB, later, tieA, earlier]);
    expect(timeline.map((entry) => entry.id)).toEqual([
      earlier.id,
      later.id,
      tieA.id,
      tieB.id,
    ]);
  });

  it("summary order is the exact reverse (newest first)", () => {
    const a = event({ createdAt: "2026-08-16T10:00:00.000Z" });
    const b = event({ createdAt: "2026-08-17T10:00:00.000Z" });
    expect(sortEventsNewestFirst([a, b]).map((entry) => entry.id)).toEqual([
      b.id,
      a.id,
    ]);
  });

  it("does not mutate the input array", () => {
    const a = event({ createdAt: "2026-08-17T10:00:00.000Z" });
    const b = event({ createdAt: "2026-08-16T10:00:00.000Z" });
    const input = [a, b];
    sortTimelineOldestFirst(input);
    expect(input).toEqual([a, b]);
  });
});

describe("finished unit", () => {
  it("carries finished_at through and keeps the finishing event in the timeline", () => {
    const finishEvent = event({
      deltaPercent: 25,
      remainingAfter: 0,
      createdAt: "2026-08-18T11:00:00.000Z",
    });
    const history = deriveItemHistory(
      source({
        item: {
          id: "33333333-3333-4333-8333-333333333333",
          remainingPercent: 0,
          addedAt: "2026-08-15T08:00:00.000Z",
          finishedAt: "2026-08-18T11:00:00.000Z",
          restockedFromItemId: null,
        },
        events: [finishEvent],
      }),
    );

    expect(history.finishedAt).toBe("2026-08-18T11:00:00.000Z");
    expect(history.lastConsumedAt).toBe("2026-08-18T11:00:00.000Z");
    expect(history.timeline).toEqual([finishEvent]);
  });
});

describe("restock lineage (old unit → new unit)", () => {
  it("a finished unit restocked later exposes the child id and its added_at", () => {
    const history = deriveItemHistory(
      source({
        restockedBy: {
          id: "44444444-4444-4444-8444-444444444444",
          addedAt: "2026-08-18T09:15:00.000Z",
        },
      }),
    );
    expect(history.restockedByItemId).toBe(
      "44444444-4444-4444-8444-444444444444",
    );
    expect(history.restockedAt).toBe("2026-08-18T09:15:00.000Z");
  });

  it("a restocked unit points back at its finished source", () => {
    const history = deriveItemHistory(
      source({
        item: {
          id: "44444444-4444-4444-8444-444444444444",
          remainingPercent: 100,
          addedAt: "2026-08-18T09:15:00.000Z",
          finishedAt: null,
          restockedFromItemId: "33333333-3333-4333-8333-333333333333",
        },
      }),
    );
    expect(history.restockedFromItemId).toBe(
      "33333333-3333-4333-8333-333333333333",
    );
    expect(history.restockedByItemId).toBeNull();
  });

  it("missing lineage (pre-migration restock) stays null, not an error", () => {
    const history = deriveItemHistory(source());
    expect(history.restockedFromItemId).toBeNull();
    expect(history.restockedAt).toBeNull();
  });
});
