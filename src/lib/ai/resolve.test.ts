import { describe, expect, it } from "vitest";

import {
  resolveCompletionParts,
  resolveCompletionProposals,
  resolveRecipeDraft,
  UnresolvedDraftError,
} from "./resolve";
import { buildTurnInventory } from "./snapshot";
import {
  EGGS_ITEM_ID,
  makeFridge,
  MILK_ITEM_ID,
  SHAKSHUKA_RECIPE_DRAFT,
  TOMATO_ITEM_ID,
} from "./test-fixtures";

const inventory = buildTurnInventory(makeFridge());

describe("resolveRecipeDraft", () => {
  it("maps refs to the database ids they were minted from", () => {
    const recipe = resolveRecipeDraft(SHAKSHUKA_RECIPE_DRAFT, inventory);
    expect(recipe.ingredients[0].matchedItemIds).toEqual([EGGS_ITEM_ID]);
    expect(recipe.ingredients[1].matchedItemIds).toEqual([TOMATO_ITEM_ID]);
    expect(recipe.ingredients[2].matchedItemIds).toEqual([]);
    expect(recipe.title).toBe("Shakshuka");
  });

  it("throws UnresolvedDraftError for refs outside the snapshot", () => {
    const draft = {
      ...SHAKSHUKA_RECIPE_DRAFT,
      ingredients: [
        {
          name: "Eggs",
          quantity: null,
          optional: false,
          matchedItemRefs: ["item_99"],
          availability: "have" as const,
        },
      ],
    };
    expect(() => resolveRecipeDraft(draft, inventory)).toThrow(
      UnresolvedDraftError,
    );
  });
});

describe("resolveCompletionParts", () => {
  it("passes text through and resolves structured parts", () => {
    const parts = resolveCompletionParts(
      [
        { type: "text", text: "Here you go." },
        { type: "recipe", recipe: SHAKSHUKA_RECIPE_DRAFT },
        {
          type: "missing_ingredient",
          ingredient: {
            name: "Onion",
            quantity: null,
            optional: false,
            matchedItemRefs: [],
            availability: "unconfirmed",
          },
          question: "Do you have onions?",
        },
      ],
      inventory,
    );

    expect(parts[0]).toEqual({ type: "text", text: "Here you go." });
    const recipePart = parts[1];
    if (recipePart.type !== "recipe") throw new Error("expected recipe");
    expect(recipePart.recipe.ingredients[0].matchedItemIds).toEqual([
      EGGS_ITEM_ID,
    ]);
    expect(parts[2]).toMatchObject({
      type: "missing_ingredient",
      ingredient: { name: "Onion", matchedItemIds: [] },
    });
  });
});

describe("resolveCompletionProposals", () => {
  it("passes add_item payloads through after schema validation", () => {
    const drafts = resolveCompletionProposals(
      [
        {
          kind: "add_item",
          payload: { name: "Onions", category: "Vegetables", units: 1 },
        },
      ],
      inventory,
    );
    expect(drafts).toEqual([
      {
        kind: "add_item",
        payload: { name: "Onions", category: "Vegetables", units: 1 },
      },
    ]);
  });

  it("derives itemId/productName/fromPercent from the snapshot", () => {
    const drafts = resolveCompletionProposals(
      [
        {
          kind: "consume_recipe",
          payload: {
            recipe: SHAKSHUKA_RECIPE_DRAFT,
            consumptions: [
              { ref: "item_1", toPercent: 75 },
              { ref: "item_3", toPercent: 0 },
            ],
          },
        },
      ],
      inventory,
    );

    expect(drafts).toHaveLength(1);
    const draft = drafts[0];
    if (draft.kind !== "consume_recipe") throw new Error("wrong kind");
    expect(draft.payload.consumptions).toEqual([
      {
        itemId: MILK_ITEM_ID,
        productName: "Milk",
        fromPercent: 100,
        toPercent: 75,
      },
      {
        itemId: TOMATO_ITEM_ID,
        productName: "Tomatoes",
        fromPercent: 50,
        toPercent: 0,
      },
    ]);
    expect(draft.payload.recipe.ingredients[0].matchedItemIds).toEqual([
      EGGS_ITEM_ID,
    ]);
  });

  it("rejects unknown refs and non-decreasing transitions as bugs", () => {
    expect(() =>
      resolveCompletionProposals(
        [
          {
            kind: "consume_recipe",
            payload: {
              recipe: SHAKSHUKA_RECIPE_DRAFT,
              consumptions: [{ ref: "item_42", toPercent: 0 }],
            },
          },
        ],
        inventory,
      ),
    ).toThrow(UnresolvedDraftError);

    expect(() =>
      resolveCompletionProposals(
        [
          {
            kind: "consume_recipe",
            payload: {
              recipe: SHAKSHUKA_RECIPE_DRAFT,
              // item_3 is at 50% — proposing 50% is not a consumption.
              consumptions: [{ ref: "item_3", toPercent: 50 }],
            },
          },
        ],
        inventory,
      ),
    ).toThrow(UnresolvedDraftError);
  });

  it("rejects an add_item draft that fails the frozen schema", () => {
    expect(() =>
      resolveCompletionProposals(
        [
          {
            kind: "add_item",
            payload: {
              name: "",
              category: "Vegetables",
              units: 1,
            },
          },
        ],
        inventory,
      ),
    ).toThrow(UnresolvedDraftError);
  });
});
