/**
 * Canonical → provider message conversion.
 *
 * The database keeps the full provider-neutral history (`ai_messages.parts`);
 * providers receive a BOUNDED recent window rendered to plain text. Nothing
 * is ever deleted: when old messages fall outside the window, a synthetic
 * system note tells the model that earlier context was omitted.
 *
 * Stored parts may contain database ids (`matchedItemIds`, `proposalId`).
 * Those are NEVER rendered: providers only ever see per-turn refs, and the
 * adapter has no id → ref mapping by design. The model re-derives current
 * matches from the snapshot in its system prompt or via findFridgeItems.
 *
 * Structured parts are rendered deterministically so a failover replays a
 * byte-identical context to the next provider.
 */

import type { ModelMessage } from "ai";

import type { AIMessage, AIMessagePart, AIRecipeDraft } from "@/lib/v2/types";

import { AI_LIMITS } from "./config";

/**
 * Recipes from prior assistant messages (oldest → newest), converted to the
 * ref-based draft shape the tools work with. Stored `matchedItemIds` are
 * database ids from an EARLIER turn; they cannot be mapped to this turn's
 * refs inside the provider layer, so the embedded copies carry no matches —
 * `availability` still tells the model what the user had.
 */
export function extractHistoryRecipeDrafts(
  messages: AIMessage[],
): AIRecipeDraft[] {
  const recipes: AIRecipeDraft[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type !== "recipe") continue;
      recipes.push({
        title: part.recipe.title,
        servings: part.recipe.servings,
        instructions: part.recipe.instructions,
        ingredients: part.recipe.ingredients.map((ingredient) => ({
          name: ingredient.name,
          quantity: ingredient.quantity,
          optional: ingredient.optional,
          matchedItemRefs: [],
          availability: ingredient.availability,
        })),
        notes: part.recipe.notes,
      });
    }
  }
  return recipes;
}

/** Renders one stored part as text for the model. Database ids are omitted. */
export function renderPartForModel(part: AIMessagePart): string {
  switch (part.type) {
    case "text":
      return part.text;
    case "recipe": {
      const recipe = part.recipe;
      const ingredients = recipe.ingredients
        .map((ingredient) => {
          const bits = [
            ingredient.quantity,
            ingredient.availability,
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

function renderMessage(message: AIMessage): {
  role: "user" | "assistant" | "system";
  content: string;
} {
  const content = message.parts
    .map((part) => renderPartForModel(part))
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
  limits: {
    maxMessages: number;
    maxChars: number;
  } = {
    maxMessages: AI_LIMITS.maxContextMessages,
    maxChars: AI_LIMITS.maxContextChars,
  },
): ModelMessage[] {
  const rendered = messages
    .map((message) => renderMessage(message))
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
