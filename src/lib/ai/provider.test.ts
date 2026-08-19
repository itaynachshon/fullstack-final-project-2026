import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";

import type { AICompletionRequest } from "@/lib/v2/types";

import { TransientProviderError } from "./errors";
import { createVercelAIProvider } from "./provider";
import {
  CONVERSATION_ID,
  EGGS_ITEM_ID,
  makeFridge,
  makeMessage,
  MILK_ITEM_ID,
  SHAKSHUKA_RECIPE,
  textMessage,
} from "./test-fixtures";

/** Minimal LanguageModelV3 generate results (cast — mock-only shapes). */
function generation(content: unknown[], unified: "stop" | "tool-calls") {
  return {
    content,
    finishReason: { unified },
    usage: {
      inputTokens: {
        total: 10,
        noCache: 10,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: 5, text: 5, reasoning: undefined },
    },
    warnings: [],
  };
}

function makeAdapter(results: ReturnType<typeof generation>[]) {
  const model = new MockLanguageModelV3({
    provider: "mock",
    modelId: "mock-model",
    doGenerate: results as never,
  });
  const provider = createVercelAIProvider({
    id: "mock",
    displayName: "Mock",
    model,
    maxOutputTokens: 512,
  });
  return { model, provider };
}

function makeRequest(
  overrides: Partial<AICompletionRequest> = {},
): AICompletionRequest {
  return {
    conversationId: CONVERSATION_ID,
    messages: [textMessage("user", "What can I cook tonight?")],
    fridge: makeFridge(),
    userMessage: "What can I cook tonight?",
    ...overrides,
  };
}

// Snapshot refs for makeFridge(): item_1 Milk 100%, item_2 Eggs 75%,
// item_3 Tomatoes 50%.
const RECIPE_TOOL_INPUT = JSON.stringify({
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
});

describe("createVercelAIProvider", () => {
  it("returns a single text part for a plain text answer", async () => {
    const { provider } = makeAdapter([
      generation([{ type: "text", text: "Try a quick omelette!" }], "stop"),
    ]);
    const response = await provider.complete(makeRequest());
    expect(response.parts).toEqual([
      { type: "text", text: "Try a quick omelette!" },
    ]);
    expect(response.proposals).toEqual([]);
  });

  it("runs the tool loop and assembles recipe + text parts", async () => {
    const { provider, model } = makeAdapter([
      generation(
        [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "proposeRecipe",
            input: RECIPE_TOOL_INPUT,
          },
        ],
        "tool-calls",
      ),
      generation(
        [{ type: "text", text: "Here's a shakshuka you can make." }],
        "stop",
      ),
    ]);

    const response = await provider.complete(makeRequest());

    expect(response.parts).toHaveLength(2);
    const [recipePart, textPart] = response.parts;
    if (recipePart.type !== "recipe") throw new Error("expected recipe part");
    expect(recipePart.recipe.ingredients[0].matchedItemIds).toEqual([
      EGGS_ITEM_ID,
    ]);
    expect(textPart).toEqual({
      type: "text",
      text: "Here's a shakshuka you can make.",
    });
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it("collects add + consumption proposals from tool calls", async () => {
    const { provider } = makeAdapter([
      generation(
        [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "proposeAddItem",
            input: JSON.stringify({
              name: "Onions",
              category: "Vegetables",
              units: 1,
            }),
          },
          {
            type: "tool-call",
            toolCallId: "call-2",
            toolName: "proposeConsumption",
            input: JSON.stringify({
              consumptions: [{ itemRef: "item_1", toPercent: 75 }],
            }),
          },
        ],
        "tool-calls",
      ),
      generation([{ type: "text", text: "Prepared both for you." }], "stop"),
    ]);

    // The consumption tool needs a recipe — provide one via history.
    const response = await provider.complete(
      makeRequest({
        messages: [
          textMessage("user", "shakshuka?"),
          makeMessage("assistant", [
            { type: "recipe", recipe: SHAKSHUKA_RECIPE },
          ]),
          textMessage("user", "I cooked it, and I also have onions"),
        ],
      }),
    );

    expect(response.proposals).toEqual([
      {
        kind: "add_item",
        payload: { name: "Onions", category: "Vegetables", units: 1 },
      },
      {
        kind: "consume_recipe",
        payload: {
          recipe: SHAKSHUKA_RECIPE,
          consumptions: [
            {
              itemId: MILK_ITEM_ID,
              productName: "Milk",
              fromPercent: 100,
              toPercent: 75,
            },
          ],
        },
      },
    ]);
  });

  it("sends refs — never UUIDs or user ids — to the model", async () => {
    const { provider, model } = makeAdapter([
      generation([{ type: "text", text: "ok" }], "stop"),
    ]);
    await provider.complete(makeRequest());

    const call = model.doGenerateCalls[0];
    const wire = JSON.stringify(call.prompt) + JSON.stringify(call.tools);
    expect(wire).toContain("item_1");
    expect(wire).toContain("Milk");
    expect(wire).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
  });

  it("treats an empty completion as a transient provider failure", async () => {
    const { provider } = makeAdapter([generation([], "stop")]);
    await expect(provider.complete(makeRequest())).rejects.toBeInstanceOf(
      TransientProviderError,
    );
  });

  it("skips fridge entries without a product embed instead of crashing", async () => {
    const { provider } = makeAdapter([
      generation([{ type: "text", text: "ok" }], "stop"),
    ]);
    const bare = { ...makeFridge()[0] } as Record<string, unknown>;
    delete bare.product;
    const response = await provider.complete(
      makeRequest({
        fridge: [
          bare as unknown as AICompletionRequest["fridge"][number],
          ...makeFridge().slice(1),
        ],
      }),
    );
    expect(response.parts[0].type).toBe("text");
  });
});
