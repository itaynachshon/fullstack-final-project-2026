import { describe, expect, it } from "vitest";

import {
  deriveRestockDigest,
  isRestockDigestEmpty,
  summarizeNames,
  type RestockSourceItem,
} from "./restock-items.ts";

const NOW = Date.parse("2026-08-23T06:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const live = (
  productId: string,
  name: string,
  remaining: number,
): RestockSourceItem => ({
  productId,
  productName: name,
  remainingPercent: remaining,
  finishedAt: null,
});

const finished = (
  productId: string,
  name: string,
  finishedMsAgo: number,
): RestockSourceItem => ({
  productId,
  productName: name,
  remainingPercent: 0,
  finishedAt: iso(finishedMsAgo),
});

describe("deriveRestockDigest", () => {
  it("mirrors the MVP low rule: ≤ 25% and live; 26% is not low", () => {
    const digest = deriveRestockDigest(
      [live("a", "Milk", 25), live("b", "Eggs", 26), live("c", "Hummus", 100)],
      NOW,
    );
    expect(digest.lowNames).toEqual(["Milk"]);
    expect(digest.finishedNames).toEqual([]);
  });

  it("dedupes low units per product and sorts lowest level first", () => {
    const digest = deriveRestockDigest(
      [
        live("a", "Milk", 25),
        live("a", "Milk", 25),
        live("b", "Cottage", 0), // 0% but never finished → still a live low unit
      ],
      NOW,
    );
    expect(digest.lowNames).toEqual(["Cottage", "Milk"]);
  });

  it("reports finished products from the last 14 days, newest first", () => {
    const digest = deriveRestockDigest(
      [
        finished("a", "Yogurt", 2 * DAY),
        finished("b", "Butter", 1 * DAY),
        finished("c", "Tahini", 15 * DAY), // outside the window
      ],
      NOW,
    );
    expect(digest.finishedNames).toEqual(["Butter", "Yogurt"]);
  });

  it("hides a finished product once a live unit of it exists (restocked)", () => {
    const digest = deriveRestockDigest(
      [finished("a", "Yogurt", DAY), live("a", "Yogurt", 100)],
      NOW,
    );
    expect(digest.finishedNames).toEqual([]);
    expect(digest.lowNames).toEqual([]);
  });

  it("keeps one row per finished product (the latest unit represents it)", () => {
    const digest = deriveRestockDigest(
      [finished("a", "Yogurt", 3 * DAY), finished("a", "Yogurt", DAY)],
      NOW,
    );
    expect(digest.finishedNames).toEqual(["Yogurt"]);
  });

  it("is empty for a healthy fridge", () => {
    const digest = deriveRestockDigest([live("a", "Milk", 75)], NOW);
    expect(isRestockDigestEmpty(digest)).toBe(true);
  });

  it("skips rows without a product name instead of rendering blanks", () => {
    const digest = deriveRestockDigest(
      [
        {
          productId: "a",
          productName: null,
          remainingPercent: 0,
          finishedAt: iso(DAY),
        },
      ],
      NOW,
    );
    expect(isRestockDigestEmpty(digest)).toBe(true);
  });
});

describe("summarizeNames", () => {
  it("joins short lists and caps long ones", () => {
    expect(summarizeNames(["Milk"], 3)).toBe("Milk");
    expect(summarizeNames(["A", "B", "C"], 3)).toBe("A, B, C");
    expect(summarizeNames(["A", "B", "C", "D", "E"], 3)).toBe(
      "A, B, C and 2 more",
    );
    expect(summarizeNames([], 3)).toBe("");
  });
});
