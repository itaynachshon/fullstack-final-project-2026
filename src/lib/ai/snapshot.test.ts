import { describe, expect, it } from "vitest";

import type { FridgeItemWithLineage } from "@/lib/v2/types";

import {
  buildTurnInventory,
  findMatches,
  hasProduct,
  serializeInventoryForModel,
  serializeItemsForTool,
} from "./snapshot";
import {
  EGGS_ITEM_ID,
  FINISHED_ITEM_ID,
  makeFridge,
  makeUnit,
  MILK_ITEM_ID,
  TOMATO_ITEM_ID,
  USER_ID,
} from "./test-fixtures";

describe("hasProduct", () => {
  it("rejects frozen-shaped units without a product embed", () => {
    const bare: FridgeItemWithLineage = {
      id: MILK_ITEM_ID,
      userId: USER_ID,
      productId: "55555555-5555-4555-8555-555555555555",
      remainingPercent: 100,
      addedAt: "2026-08-01T10:00:00.000Z",
      finishedAt: null,
      updatedAt: "2026-08-01T10:00:00.000Z",
      restockedFromItemId: null,
    };
    expect(hasProduct(bare)).toBe(false);
    expect(hasProduct(makeUnit())).toBe(true);
  });
});

describe("buildTurnInventory", () => {
  it("keeps only live units, in stable order, with sequential refs", () => {
    const inventory = buildTurnInventory(makeFridge());
    expect(inventory.items.map((item) => item.ref)).toEqual([
      "item_1",
      "item_2",
      "item_3",
    ]);
    expect(inventory.items.map((item) => item.name)).toEqual([
      "Milk",
      "Eggs",
      "Tomatoes",
    ]);
    expect(inventory.byItemId.has(FINISHED_ITEM_ID)).toBe(false);
    expect(inventory.byRef.get("item_2")?.itemId).toBe(EGGS_ITEM_ID);
  });

  it("breaks added_at ties by id so refs are deterministic", () => {
    const sameTime = "2026-08-05T10:00:00.000Z";
    const b = makeUnit({ id: TOMATO_ITEM_ID, addedAt: sameTime });
    const a = makeUnit({ id: EGGS_ITEM_ID, addedAt: sameTime });
    const inventory = buildTurnInventory([b, a]);
    expect(inventory.items[0].itemId).toBe(EGGS_ITEM_ID);
  });
});

describe("privacy of the serialized snapshot", () => {
  it("exposes refs + product facts and nothing else", () => {
    const inventory = buildTurnInventory(makeFridge());
    const serialized = JSON.stringify(serializeItemsForTool(inventory.items));

    expect(serialized).toContain("item_1");
    expect(serialized).toContain("Milk");
    expect(serialized).toContain("Tnuva");
    expect(serialized).toContain("1L");
    // No database UUIDs, no user identity, no timestamps.
    expect(serialized).not.toContain(MILK_ITEM_ID);
    expect(serialized).not.toContain(USER_ID);
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(serialized).not.toContain("userId");
    expect(serialized).not.toContain("addedAt");
    expect(serialized).not.toContain("@");
  });

  it("renders the prompt snapshot without UUIDs either", () => {
    const inventory = buildTurnInventory(makeFridge());
    const text = serializeInventoryForModel(inventory);
    expect(text).toContain("item_1: Milk (Tnuva, 1L) — Dairy — 100% remaining");
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it("says so when the fridge is empty", () => {
    expect(serializeInventoryForModel(buildTurnInventory([]))).toContain(
      "empty",
    );
  });
});

describe("findMatches", () => {
  const inventory = buildTurnInventory(makeFridge());

  it("matches by name, brand, and category tokens", () => {
    expect(findMatches(inventory, "milk").map((i) => i.ref)).toEqual([
      "item_1",
    ]);
    expect(findMatches(inventory, "tnuva milk")).toHaveLength(1);
    expect(findMatches(inventory, "vegetables").map((i) => i.name)).toEqual([
      "Tomatoes",
    ]);
  });

  it("returns nothing for absent ingredients", () => {
    expect(findMatches(inventory, "onion")).toEqual([]);
    expect(findMatches(inventory, "   ")).toEqual([]);
  });
});
