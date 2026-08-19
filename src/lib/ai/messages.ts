/**
 * Canonical → provider message conversion.
 *
 * The database keeps the full provider-neutral history (`ai_messages.parts`);
 * providers receive a BOUNDED recent window rendered to plain text. Nothing
 * is ever deleted: when old messages fall outside the window, a synthetic
 * system note tells the model that earlier context was omitted.
 *
 * Structured parts are rendered deterministically so a failover replays a
 * byte-identical context to the next provider.
 */

import type { ModelMessage } from "ai";

import type { AIMessage, AIMessagePart, Recipe } from "@/lib/v2/types";

import { AI_LIMITS } from "./config";
import type { TurnInventory } from "./types";

/** Recipes from prior assistant messages, oldest → newest. */
export function extractHistoryRecipes(messages: AIMessage[]): Recipe[] {
  const recipes: Recipe[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type === "recipe") recipes.push(part.recipe);
    }
  }
  return recipes;
}

/**
 * Renders one stored part as text for the model. Item UUIDs are translated
 * to the CURRENT turn's refs where the unit still exists; otherwise omitted.
 */
export function renderPartForModel(
  part: AIMessagePart,
  inventory: TurnInventory,
): string {
  switch (part.type) {
    case "text":
      return part.text;
    case "recipe": {
      const recipe = part.recipe;
      const ingredients = recipe.ingredients
        .map((ingredient) => {
          const refs = ingredient.matchedItemIds
            .map((id) => inventory.byItemId.get(id)?.ref)
            .filter((ref): ref is string => Boolean(ref));
          const bits = [
            ingredient.quantity,
            ingredient.availability,
            refs.length > 0 ? refs.join(",") : null,
            ingredient.optional ? "optional" : null,
          ]
            .filter(Boolean)
            .join("; ");
          return `  - ${ingredient.name}${bits ? ` (${bits})` : ""}`;
        })
        .join("\n");
      const steps = recipe.instructions
        .map((step, index) => `  ${index + 1}. ${step}`)
        .join("\n");
      return [
        `[Recipe shown to user] ${recipe.title}` +
          (recipe.servings ? ` (serves ${recipe.servings})` : ""),
        "Ingredients:",
        ingredients,
        "Steps:",
        steps,
        ...(recipe.notes ? [`Notes: ${recipe.notes}`] : []),
      ].join("\n");
    }
    case "missing_ingredient":
      return `[Asked the user about "${part.ingredient.name}" (${part.ingredient.availability})] ${part.question}`;
    case "action_proposal":
      return part.kind === "add_item"
        ? "[Prepared an add-item proposal — awaiting the user's confirmation in the UI.]"
        : "[Prepared a consumption proposal — awaiting the user's confirmation in the UI.]";
  }
}

function renderMessage(
  message: AIMessage,
  inventory: TurnInventory,
): { role: "user" | "assistant" | "system"; content: string } {
  const content = message.parts
    .map((part) => renderPartForModel(part, inventory))
    .filter((text) => text.length > 0)
    .join("\n\n");
  return { role: message.role, content };
}

/**
 * Selects the bounded recent window (message count + character budget) and
 * converts to ModelMessages. The newest message is always included.
 */
export function toBoundedModelMessages(
  messages: AIMessage[],
  inventory: TurnInventory,
  limits: {
    maxMessages: number;
    maxChars: number;
  } = {
    maxMessages: AI_LIMITS.maxContextMessages,
    maxChars: AI_LIMITS.maxContextChars,
  },
): ModelMessage[] {
  const rendered = messages
    .map((message) => renderMessage(message, inventory))
    .filter((message) => message.content.length > 0);

  const window: typeof rendered = [];
  let chars = 0;
  for (let i = rendered.length - 1; i >= 0; i -= 1) {
    const candidate = rendered[i];
    const overBudget =
      window.length >= limits.maxMessages ||
      chars + candidate.content.length > limits.maxChars;
    if (window.length > 0 && overBudget) break;
    window.unshift(candidate);
    chars += candidate.content.length;
  }

  const omitted = rendered.length - window.length;
  const result: ModelMessage[] = [];
  if (omitted > 0) {
    result.push({
      role: "system",
      content:
        `${omitted} earlier message(s) in this conversation were omitted ` +
        "for length. The full history is preserved in the app.",
    });
  }
  for (const message of window) {
    result.push({ role: message.role, content: message.content });
  }
  return result;
}
