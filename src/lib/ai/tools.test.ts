import type { ToolSet } from "ai";
import { describe, expect, it } from "vitest";
import type { z } from "zod";

import type { Recipe } from "@/lib/v2/types";

import { buildTurnInventory } from "./snapshot";
import {
  EGGS_ITEM_ID,
  makeFridge,
  MILK_ITEM_ID,
  SHAKSHUKA_RECIPE,
  TOMATO_ITEM_ID,
} from "./test-fixtures";
import { createChatTools } from "./tools";
import type { TurnState } from "./types";

function makeTurn(historyRecipes: Recipe[] = []): TurnState {
  return {
    inventory: buildTurnInventory(makeFridge()),
    historyRecipes,
    turnRecipes: [],
    parts: [],
    proposals: [],
  };
}

async function runTool(
  tools: ToolSet,
  name: string,
  input: unknown,
): Promise<Record<string, unknown>> {
  const tool = tools[name] as unknown as {
    execute: (input: unknown, options: unknown) => Promise<unknown> | unknown;
  };
  return (await tool.execute(input, {})) as Record<string, unknown>;
}

function inputSchemaOf(tools: ToolSet, name: string): z.ZodTypeAny {
  return (tools[name] as unknown as { inputSchema: z.ZodTypeAny }).inputSchema;
}

// Refs for makeFridge(): item_1 = Milk 100%, item_2 = Eggs 75%,
// item_3 = Tomatoes 50% (finished yogurt excluded).

const MODEL_RECIPE_INPUT = {
  title: "Shakshuka",
  servings: 2,
  instructions: ["Simmer tomatoes.", "Crack in the eggs."],
  ingredients: [
    {
      name: "Eggs",
      quantity: "4",
      availability: "have",
      matchedItemRefs: ["item_2"],
    },
    {
      name: "Tomatoes",
      quantity: "3",
      availability: "have",
      matchedItemRefs: ["item_3"],
    },
    { name: "Onion", quantity: "1", availability: "unconfirmed" },
  ],
};

describe("read tools", () => {
  it("getFridgeInventory returns the ref-based snapshot without UUIDs", async () => {
    const turn = makeTurn();
    const result = await runTool(
      createChatTools(turn),
      "getFridgeInventory",
      {},
    );
    expect(result.ok).toBe(true);
    expect(result.unitCount).toBe(3);
    const serialized = JSON.stringify(result);
    expect(serialized).toContain("item_1");
    expect(serialized).not.toContain(MILK_ITEM_ID);
  });

  it("findFridgeItems finds matches and returns empty for unknowns", async () => {
    const tools = createChatTools(makeTurn());
    const found = await runTool(tools, "findFridgeItems", { query: "eggs" });
    expect(found.matchCount).toBe(1);
    const missing = await runTool(tools, "findFridgeItems", { query: "onion" });
    expect(missing.matchCount).toBe(0);
  });
});

describe("proposeRecipe", () => {
  it("maps refs to item UUIDs and stashes a valid frozen recipe part", async () => {
    const turn = makeTurn();
    const result = await runTool(
      createChatTools(turn),
      "proposeRecipe",
      MODEL_RECIPE_INPUT,
    );
    expect(result.ok).toBe(true);
    expect(turn.parts).toHaveLength(1);
    const part = turn.parts[0];
    if (part.type !== "recipe") throw new Error("expected recipe part");
    expect(part.recipe.title).toBe("Shakshuka");
    expect(part.recipe.ingredients[0].matchedItemIds).toEqual([EGGS_ITEM_ID]);
    expect(part.recipe.ingredients[1].matchedItemIds).toEqual([TOMATO_ITEM_ID]);
    expect(part.recipe.ingredients[2].availability).toBe("unconfirmed");
    expect(turn.turnRecipes).toHaveLength(1);
  });

  it("rejects unknown refs with a corrective error (no throw)", async () => {
    const turn = makeTurn();
    const result = await runTool(createChatTools(turn), "proposeRecipe", {
      ...MODEL_RECIPE_INPUT,
      ingredients: [
        { name: "Eggs", availability: "have", matchedItemRefs: ["item_99"] },
      ],
    });
    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("item_99");
    expect(turn.parts).toHaveLength(0);
  });

  it("coerces contradictory availability claims", async () => {
    const turn = makeTurn();
    await runTool(createChatTools(turn), "proposeRecipe", {
      ...MODEL_RECIPE_INPUT,
      ingredients: [
        // "missing" but matched in the fridge → have.
        { name: "Eggs", availability: "missing", matchedItemRefs: ["item_2"] },
        // "have" but nothing matched → unconfirmed.
        { name: "Cream", availability: "have" },
      ],
    });
    const part = turn.parts[0];
    if (part.type !== "recipe") throw new Error("expected recipe part");
    expect(part.recipe.ingredients[0].availability).toBe("have");
    expect(part.recipe.ingredients[1].availability).toBe("unconfirmed");
  });
});

describe("askAboutIngredient", () => {
  it("stashes a missing_ingredient part for uncertain items", async () => {
    const turn = makeTurn();
    const result = await runTool(createChatTools(turn), "askAboutIngredient", {
      name: "Onion",
      availability: "unconfirmed",
      question: "Do you have onions at home?",
    });
    expect(result.ok).toBe(true);
    expect(turn.parts[0]).toMatchObject({
      type: "missing_ingredient",
      question: "Do you have onions at home?",
      ingredient: { name: "Onion", availability: "unconfirmed" },
    });
  });
});

describe("proposeAddItem", () => {
  it("stashes a pending add proposal (no fridge write)", async () => {
    const turn = makeTurn();
    const result = await runTool(createChatTools(turn), "proposeAddItem", {
      name: "Onions",
      category: "Vegetables",
      units: 1,
    });
    expect(result.ok).toBe(true);
    expect(String(result.message)).toContain("confirmation");
    expect(turn.proposals).toEqual([
      {
        kind: "add_item",
        payload: { name: "Onions", category: "Vegetables", units: 1 },
      },
    ]);
  });

  it("its input schema rejects invalid payloads (SDK validation boundary)", () => {
    const schema = inputSchemaOf(createChatTools(makeTurn()), "proposeAddItem");
    expect(
      schema.safeParse({ name: "X", category: "Junk", units: 1 }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ name: "X", category: "Dairy", units: 0 }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ name: "", category: "Dairy", units: 1 }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ name: "X", category: "Dairy", units: 1 }).success,
    ).toBe(true);
  });

  it("enforces the per-turn proposal budget", async () => {
    const turn = makeTurn();
    const tools = createChatTools(turn);
    for (let i = 0; i < 5; i += 1) {
      await runTool(tools, "proposeAddItem", {
        name: `Item ${i}`,
        category: "Other",
        units: 1,
      });
    }
    const result = await runTool(tools, "proposeAddItem", {
      name: "One too many",
      category: "Other",
      units: 1,
    });
    expect(result.ok).toBe(false);
    expect(turn.proposals).toHaveLength(5);
  });
});

describe("proposeConsumption", () => {
  it("requires a recipe in context", async () => {
    const result = await runTool(
      createChatTools(makeTurn()),
      "proposeConsumption",
      { consumptions: [{ itemRef: "item_2", toPercent: 50 }] },
    );
    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("recipe");
  });

  it("builds server-derived transitions from the snapshot", async () => {
    const turn = makeTurn();
    const tools = createChatTools(turn);
    await runTool(tools, "proposeRecipe", MODEL_RECIPE_INPUT);
    const result = await runTool(tools, "proposeConsumption", {
      consumptions: [
        { itemRef: "item_1", toPercent: 75 },
        { itemRef: "item_2", toPercent: 50 },
        { itemRef: "item_3", toPercent: 0 },
      ],
    });
    expect(result.ok).toBe(true);
    expect(String(result.message)).toContain("Milk 100% → 75%");

    const proposal = turn.proposals.find((p) => p.kind === "consume_recipe");
    if (proposal?.kind !== "consume_recipe")
      throw new Error("missing proposal");
    // fromPercent comes from the snapshot, NOT from the model.
    expect(proposal.payload.consumptions).toEqual([
      {
        itemId: MILK_ITEM_ID,
        productName: "Milk",
        fromPercent: 100,
        toPercent: 75,
      },
      {
        itemId: EGGS_ITEM_ID,
        productName: "Eggs",
        fromPercent: 75,
        toPercent: 50,
      },
      {
        itemId: TOMATO_ITEM_ID,
        productName: "Tomatoes",
        fromPercent: 50,
        toPercent: 0,
      },
    ]);
    expect(proposal.payload.recipe.title).toBe("Shakshuka");
  });

  it("falls back to a recipe from conversation history", async () => {
    const turn = makeTurn([SHAKSHUKA_RECIPE]);
    const tools = createChatTools(turn);
    const result = await runTool(tools, "proposeConsumption", {
      consumptions: [{ itemRef: "item_2", toPercent: 25 }],
    });
    expect(result.ok).toBe(true);
    const proposal = turn.proposals[0];
    if (proposal.kind !== "consume_recipe") throw new Error("wrong kind");
    expect(proposal.payload.recipe.title).toBe("Shakshuka");
  });

  it("rejects non-decreasing levels, unknown refs, and duplicates", async () => {
    const turn = makeTurn([SHAKSHUKA_RECIPE]);
    const tools = createChatTools(turn);
    const result = await runTool(tools, "proposeConsumption", {
      consumptions: [
        { itemRef: "item_2", toPercent: 75 }, // equal → not a consumption
        { itemRef: "item_42", toPercent: 25 }, // unknown
        { itemRef: "item_1", toPercent: 75 },
        { itemRef: "item_1", toPercent: 50 }, // duplicate
      ],
    });
    expect(result.ok).toBe(false);
    const message = String(result.error);
    expect(message).toContain("item_2");
    expect(message).toContain("item_42");
    expect(message).toContain("twice");
    expect(turn.proposals).toHaveLength(0);
  });

  it("its input schema only allows quarter-step levels", () => {
    const schema = inputSchemaOf(
      createChatTools(makeTurn()),
      "proposeConsumption",
    );
    expect(
      schema.safeParse({ consumptions: [{ itemRef: "item_1", toPercent: 60 }] })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({ consumptions: [{ itemRef: "item_1", toPercent: 25 }] })
        .success,
    ).toBe(true);
  });
});
