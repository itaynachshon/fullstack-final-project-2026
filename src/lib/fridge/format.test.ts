import { describe, expect, it } from "vitest";

import {
  LEVEL_LABELS,
  levelLabel,
  productMeta,
  relativeTime,
  summaryLine,
  unitChipAriaLabel,
} from "./format";

const NOW = new Date("2026-08-16T12:00:00Z");

describe("level vocabulary", () => {
  it("speaks the five-level model everywhere", () => {
    expect(LEVEL_LABELS).toEqual({
      100: "Full",
      75: "¾",
      50: "½",
      25: "¼",
      0: "Finished",
    });
    expect(levelLabel(50)).toBe("½");
  });

  it("gives unit chips a full-sentence accessible label", () => {
    expect(unitChipAriaLabel(2, 50)).toBe(
      "Unit 2 — half remaining. Change level.",
    );
    expect(unitChipAriaLabel(1, 0)).toBe("Unit 1 — finished. Change level.");
  });
});

describe("productMeta", () => {
  it("joins brand and size with a direction-neutral middle dot", () => {
    expect(
      productMeta({ brand: "תנובה", packageSize: "250 g", category: "Dairy" }),
    ).toBe("תנובה · 250 g");
  });

  it("shows whichever of brand/size exists — absence over noise", () => {
    expect(
      productMeta({ brand: "Tara", packageSize: null, category: "Dairy" }),
    ).toBe("Tara");
    expect(
      productMeta({ brand: null, packageSize: "1 L", category: "Drinks" }),
    ).toBe("1 L");
  });

  it("falls back to the category so the meta slot never collapses", () => {
    expect(
      productMeta({ brand: null, packageSize: null, category: "Snacks" }),
    ).toBe("Snacks");
  });
});

describe("relativeTime", () => {
  it("buckets into just now / minutes / hours / days, then a short date", () => {
    expect(relativeTime("2026-08-16T11:59:30Z", NOW)).toBe("just now");
    expect(relativeTime("2026-08-16T11:55:00Z", NOW)).toBe("5m ago");
    expect(relativeTime("2026-08-16T09:00:00Z", NOW)).toBe("3h ago");
    expect(relativeTime("2026-08-14T12:00:00Z", NOW)).toBe("2d ago");
    expect(relativeTime("2026-07-01T12:00:00Z", NOW)).toBe("Jul 1");
  });
});

describe("summaryLine", () => {
  it("reads as a sentence with singular/plural items", () => {
    expect(summaryLine({ items: 12, low: 3, finished: 2 })).toBe(
      "12 items · 3 low · 2 finished",
    );
    expect(summaryLine({ items: 1, low: 0, finished: 0 })).toBe("1 item");
  });

  it("omits zero-count segments — absence over noise", () => {
    expect(summaryLine({ items: 4, low: 0, finished: 1 })).toBe(
      "4 items · 1 finished",
    );
  });
});
