import { describe, expect, it } from "vitest";

import {
  buildProviderInventory,
  buildTurnInventory,
  findMatches,
  serializeInventoryForModel,
  toInventoryUnits,
} from "./snapshot";
import {
  EGGS_ITEM_ID,
  makeFridge,
  makeInventoryUnits,
  makeUnit,
  MILK_ITEM_ID,
  TOMATO_ITEM_ID,
  USER_ID,
} from "./test-fixtures";

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

describe("toInventoryUnits — the provider-facing projection", () => {
  it("matches the safe fixture shape exactly", () => {
    const units = toInventoryUnits(buildTurnInventory(makeFridge()));
    expect(units).toEqual(makeInventoryUnits());
  });

  it("exposes refs + product facts and nothing else", () => {
    const serialized = JSON.stringify(
      toInventoryUnits(buildTurnInventory(makeFridge())),
    );

    expect(serialized).toContain("item_1");
    expect(serialized).toContain("Milk");
    expect(serialized).toContain("Tnuva");
    expect(serialized).toContain("1L");
    // No database UUIDs, no user identity, no timestamps.
    expect(serialized).not.toContain(MILK_ITEM_ID);
    expect(serialized).not.toContain(USER_ID);
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(serialized).not.toContain("itemId");
    expect(serialized).not.toContain("userId");
    expect(serialized).not.toContain("addedAt");
    expect(serialized).not.toContain("@");
  });
});

describe("buildProviderInventory", () => {
  it("keys the safe units by ref", () => {
    const provider = buildProviderInventory(makeInventoryUnits());
    expect(provider.units).toHaveLength(3);
    expect(provider.byRef.get("item_2")?.name).toBe("Eggs");
    expect(provider.byRef.has("item_4")).toBe(false);
  });
});

describe("serializeInventoryForModel", () => {
  it("renders the prompt snapshot without UUIDs", () => {
    const text = serializeInventoryForModel(makeInventoryUnits());
    expect(text).toContain("item_1: Milk (Tnuva, 1L) — Dairy — 100% remaining");
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it("says so when the fridge is empty", () => {
    expect(serializeInventoryForModel([])).toContain("empty");
  });
});

describe("findMatches", () => {
  const units = makeInventoryUnits();

  it("matches by name, brand, and category tokens", () => {
    expect(findMatches(units, "milk").map((u) => u.ref)).toEqual(["item_1"]);
    expect(findMatches(units, "tnuva milk")).toHaveLength(1);
    expect(findMatches(units, "vegetables").map((u) => u.name)).toEqual([
      "Tomatoes",
    ]);
  });

  it("returns nothing for absent ingredients", () => {
    expect(findMatches(units, "onion")).toEqual([]);
    expect(findMatches(units, "   ")).toEqual([]);
  });
});
