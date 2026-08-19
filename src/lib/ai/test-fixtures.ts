/**
 * TEST-ONLY shared fixtures for the F3 AI suites: deterministic fridge
 * units, canonical messages, and model-facing recipe inputs.
 */

import type { Product, RemainingLevel } from "@/lib/types";
import type {
  AIInventoryUnit,
  AIMessage,
  AIMessagePart,
  AIRecipeDraft,
  Recipe,
} from "@/lib/v2/types";

import type { AIFridgeUnit } from "./types";

export const USER_ID = "11111111-1111-4111-8111-111111111111";
export const CONVERSATION_ID = "22222222-2222-4222-8222-222222222222";

export const MILK_ITEM_ID = "33333333-3333-4333-8333-333333333331";
export const EGGS_ITEM_ID = "33333333-3333-4333-8333-333333333332";
export const TOMATO_ITEM_ID = "33333333-3333-4333-8333-333333333333";
export const FINISHED_ITEM_ID = "33333333-3333-4333-8333-333333333334";

let productSeq = 0;

export function makeProduct(overrides: Partial<Product> = {}): Product {
  productSeq += 1;
  return {
    id: `44444444-4444-4444-8444-${String(productSeq).padStart(12, "0")}`,
    barcode: null,
    name: "Milk",
    brand: null,
    packageSize: null,
    category: "Dairy",
    imageUrl: null,
    source: "catalog",
    ...overrides,
  };
}

export function makeUnit(
  overrides: Omit<Partial<AIFridgeUnit>, "product"> & {
    product?: Partial<Product>;
  } = {},
): AIFridgeUnit {
  const { product: productOverrides, ...unitOverrides } = overrides;
  return {
    id: MILK_ITEM_ID,
    userId: USER_ID,
    productId: "55555555-5555-4555-8555-555555555555",
    remainingPercent: 100 as RemainingLevel,
    addedAt: "2026-08-01T10:00:00.000Z",
    finishedAt: null,
    updatedAt: "2026-08-01T10:00:00.000Z",
    restockedFromItemId: null,
    product: makeProduct(productOverrides),
    ...unitOverrides,
  };
}

/** Milk 100%, Eggs 75%, Tomatoes 50%, plus one finished unit (excluded). */
export function makeFridge(): AIFridgeUnit[] {
  return [
    makeUnit({
      id: MILK_ITEM_ID,
      addedAt: "2026-08-01T10:00:00.000Z",
      remainingPercent: 100,
      product: { name: "Milk", brand: "Tnuva", packageSize: "1L" },
    }),
    makeUnit({
      id: EGGS_ITEM_ID,
      addedAt: "2026-08-02T10:00:00.000Z",
      remainingPercent: 75,
      product: { name: "Eggs", category: "Other", packageSize: "12" },
    }),
    makeUnit({
      id: TOMATO_ITEM_ID,
      addedAt: "2026-08-03T10:00:00.000Z",
      remainingPercent: 50,
      product: { name: "Tomatoes", category: "Vegetables" },
    }),
    makeUnit({
      id: FINISHED_ITEM_ID,
      addedAt: "2026-08-04T10:00:00.000Z",
      remainingPercent: 0,
      product: { name: "Yogurt" },
    }),
  ];
}

/**
 * The safe provider-facing projection of makeFridge() — what
 * buildTurnInventory + toInventoryUnits produce from it.
 */
export function makeInventoryUnits(): AIInventoryUnit[] {
  return [
    {
      ref: "item_1",
      name: "Milk",
      brand: "Tnuva",
      packageSize: "1L",
      category: "Dairy",
      remainingPercent: 100,
    },
    {
      ref: "item_2",
      name: "Eggs",
      packageSize: "12",
      category: "Other",
      remainingPercent: 75,
    },
    {
      ref: "item_3",
      name: "Tomatoes",
      category: "Vegetables",
      remainingPercent: 50,
    },
  ];
}

let messageSeq = 0;

export function makeMessage(
  role: AIMessage["role"],
  parts: AIMessagePart[],
  overrides: Partial<AIMessage> = {},
): AIMessage {
  messageSeq += 1;
  return {
    id: `66666666-6666-4666-8666-${String(messageSeq).padStart(12, "0")}`,
    conversationId: CONVERSATION_ID,
    role,
    parts,
    seq: messageSeq,
    createdAt: "2026-08-10T10:00:00.000Z",
    ...overrides,
  };
}

export function textMessage(role: AIMessage["role"], text: string): AIMessage {
  return makeMessage(role, [{ type: "text", text }]);
}

export const SHAKSHUKA_RECIPE: Recipe = {
  title: "Shakshuka",
  servings: 2,
  instructions: ["Simmer tomatoes.", "Crack in the eggs.", "Cover and cook."],
  ingredients: [
    {
      name: "Eggs",
      quantity: "4",
      optional: false,
      matchedItemIds: [EGGS_ITEM_ID],
      availability: "have",
    },
    {
      name: "Tomatoes",
      quantity: "3",
      optional: false,
      matchedItemIds: [TOMATO_ITEM_ID],
      availability: "have",
    },
    {
      name: "Onion",
      quantity: "1",
      optional: false,
      matchedItemIds: [],
      availability: "unconfirmed",
    },
  ],
  notes: null,
};

/** Ref-based draft of the same recipe (refs per makeInventoryUnits()). */
export const SHAKSHUKA_RECIPE_DRAFT: AIRecipeDraft = {
  title: "Shakshuka",
  servings: 2,
  instructions: ["Simmer tomatoes.", "Crack in the eggs.", "Cover and cook."],
  ingredients: [
    {
      name: "Eggs",
      quantity: "4",
      optional: false,
      matchedItemRefs: ["item_2"],
      availability: "have",
    },
    {
      name: "Tomatoes",
      quantity: "3",
      optional: false,
      matchedItemRefs: ["item_3"],
      availability: "have",
    },
    {
      name: "Onion",
      quantity: "1",
      optional: false,
      matchedItemRefs: [],
      availability: "unconfirmed",
    },
  ],
  notes: null,
};
