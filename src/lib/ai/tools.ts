/**
 * Provider-neutral chat tools. Every provider gets the same set, bound to a
 * fresh per-attempt TurnState.
 *
 * Security model:
 * - Tool inputs are UNTRUSTED model output → validated with Zod (the AI SDK
 *   validates against `inputSchema`; semantic rules are re-checked here).
 * - Tools never throw: failures return `{ ok: false, error }` so the model
 *   can correct itself within the step budget, and an application bug is
 *   never disguised as a provider outage.
 * - READ tools see only the opaque-ref snapshot. There is no mutation tool:
 *   propose* tools stash payloads that the orchestrator persists as PENDING
 *   `ai_action_proposals`; fridge rows change only after the user accepts.
 * - The model works with per-turn refs ("item_3"); the mapping back to
 *   database UUIDs happens here, server-side.
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";

import { CATEGORIES, REMAINING_LEVELS } from "@/lib/types";
import {
  addItemProposalPayloadSchema,
  consumeRecipeProposalPayloadSchema,
  recipeSchema,
} from "@/lib/v2/schemas";
import type {
  ConsumptionProposal,
  Recipe,
  RecipeIngredient,
} from "@/lib/v2/types";

import { AI_LIMITS } from "./config";
import { findMatches, serializeItemsForTool } from "./snapshot";
import type { TurnState } from "./types";

/* ─── Model-facing schemas (refs instead of UUIDs) ────────────────────────── */

const itemRefSchema = z
  .string()
  .regex(/^item_\d{1,4}$/, "Use a ref from getFridgeInventory, e.g. item_3.");

const modelIngredientSchema = z.object({
  name: z.string().trim().min(1).max(80),
  quantity: z.string().trim().min(1).max(40).optional(),
  optional: z.boolean().optional(),
  matchedItemRefs: z.array(itemRefSchema).max(20).optional(),
  availability: z.enum(["have", "missing", "unconfirmed"]),
});

const proposeRecipeSchema = z.object({
  title: z.string().trim().min(1).max(120),
  servings: z.number().int().min(1).max(24).optional(),
  instructions: z.array(z.string().trim().min(1).max(500)).min(1).max(40),
  ingredients: z.array(modelIngredientSchema).min(1).max(40),
  notes: z.string().trim().min(1).max(500).optional(),
});

const askAboutIngredientSchema = z.object({
  name: z.string().trim().min(1).max(80),
  quantity: z.string().trim().min(1).max(40).optional(),
  availability: z.enum(["missing", "unconfirmed"]),
  question: z.string().trim().min(1).max(300),
});

const proposeAddItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  brand: z.string().trim().min(1).max(60).optional(),
  packageSize: z.string().trim().min(1).max(30).optional(),
  category: z.enum(CATEGORIES),
  units: z.number().int().min(1).max(20),
});

const proposeConsumptionSchema = z.object({
  consumptions: z
    .array(
      z.object({
        itemRef: itemRefSchema,
        toPercent: z.literal(REMAINING_LEVELS),
      }),
    )
    .min(1)
    .max(40),
});

const findFridgeItemsSchema = z.object({
  query: z.string().trim().min(1).max(80),
});

/* ─── Tool results (uniform envelope; never thrown) ───────────────────────── */

type ToolFailure = { ok: false; error: string };
type ToolSuccess<T extends object> = { ok: true } & T;

function failure(error: string): ToolFailure {
  return { ok: false, error };
}

/* ─── Tool factory ────────────────────────────────────────────────────────── */

export function createChatTools(turn: TurnState): ToolSet {
  const partBudgetExceeded = () =>
    turn.parts.length >= AI_LIMITS.maxStashedPartsPerTurn
      ? failure(
          "Too many structured blocks in one reply — finish with a text answer.",
        )
      : null;

  const proposalBudgetExceeded = () =>
    turn.proposals.length >= AI_LIMITS.maxProposalsPerTurn
      ? failure(
          "Too many proposals in one reply — wait for the user to respond.",
        )
      : null;

  return {
    getFridgeInventory: tool({
      description:
        "Read the user's current fridge inventory snapshot. Returns one row " +
        "per physical unit with an opaque ref, product name, brand, package " +
        "size, category and remaining percentage.",
      inputSchema: z.object({}),
      execute: () => ({
        ok: true,
        items: serializeItemsForTool(turn.inventory.items),
        unitCount: turn.inventory.items.length,
      }),
    }),

    findFridgeItems: tool({
      description:
        "Search the fridge snapshot for units matching a product/ingredient " +
        "name (e.g. 'tomato', 'milk'). Returns matching units with refs. An " +
        "empty result means the item is not tracked in the app — it may " +
        "still exist at home, so treat it as UNCERTAIN, not absent.",
      inputSchema: findFridgeItemsSchema,
      execute: ({ query }) => {
        const matches = findMatches(turn.inventory, query);
        return {
          ok: true,
          matches: serializeItemsForTool(matches),
          matchCount: matches.length,
        };
      },
    }),

    proposeRecipe: tool({
      description:
        "Record a complete structured recipe to show the user. Use fridge " +
        "refs in matchedItemRefs for ingredients the user has. Availability: " +
        "'have' = matched in the fridge, 'missing' = user confirmed absent, " +
        "'unconfirmed' = not tracked in the app / not confirmed either way.",
      inputSchema: proposeRecipeSchema,
      execute: (input) => {
        try {
          const budget = partBudgetExceeded();
          if (budget) return budget;

          const notes: string[] = [];
          const ingredients: RecipeIngredient[] = [];

          for (const raw of input.ingredients) {
            const refs = raw.matchedItemRefs ?? [];
            const unknown = refs.filter(
              (ref) => !turn.inventory.byRef.has(ref),
            );
            if (unknown.length > 0) {
              return failure(
                `Unknown item refs: ${unknown.join(", ")}. Call ` +
                  "getFridgeInventory and use only refs it returned.",
              );
            }
            const matchedItemIds = refs.map(
              (ref) => turn.inventory.byRef.get(ref)!.itemId,
            );

            let availability = raw.availability;
            if (matchedItemIds.length > 0 && availability === "missing") {
              availability = "have";
              notes.push(
                `"${raw.name}": marked missing but matched fridge items — recorded as have.`,
              );
            }
            if (matchedItemIds.length === 0 && availability === "have") {
              availability = "unconfirmed";
              notes.push(
                `"${raw.name}": marked have without matchedItemRefs — recorded as unconfirmed.`,
              );
            }

            ingredients.push({
              name: raw.name,
              quantity: raw.quantity ?? null,
              optional: raw.optional ?? false,
              matchedItemIds,
              availability,
            });
          }

          const recipe: Recipe = {
            title: input.title,
            servings: input.servings ?? null,
            instructions: input.instructions,
            ingredients,
            notes: input.notes ?? null,
          };

          const parsed = recipeSchema.safeParse(recipe);
          if (!parsed.success) {
            return failure("Recipe failed validation — simplify and retry.");
          }

          turn.turnRecipes.push(parsed.data);
          turn.parts.push({ type: "recipe", recipe: parsed.data });
          return {
            ok: true,
            message:
              "Recipe recorded; it will be rendered for the user. " +
              (notes.length > 0 ? `Adjustments: ${notes.join(" ")}` : ""),
          } satisfies ToolSuccess<{ message: string }>;
        } catch (error) {
          console.error("proposeRecipe tool failed:", error);
          return failure("Internal tool failure.");
        }
      },
    }),

    askAboutIngredient: tool({
      description:
        "Ask the user whether an ingredient that is missing or unconfirmed " +
        "in the app is actually available at home. Use for KNOWN_MISSING or " +
        "UNCERTAIN ingredients before assuming anything.",
      inputSchema: askAboutIngredientSchema,
      execute: (input) => {
        try {
          const budget = partBudgetExceeded();
          if (budget) return budget;

          const ingredient: RecipeIngredient = {
            name: input.name,
            quantity: input.quantity ?? null,
            optional: false,
            matchedItemIds: [],
            availability: input.availability,
          };
          turn.parts.push({
            type: "missing_ingredient",
            ingredient,
            question: input.question,
          });
          return {
            ok: true,
            message: "Question recorded; it will be shown to the user.",
          };
        } catch (error) {
          console.error("askAboutIngredient tool failed:", error);
          return failure("Internal tool failure.");
        }
      },
    }),

    proposeAddItem: tool({
      description:
        "Prepare an Add Item proposal after the user confirms they have a " +
        "product that is not tracked in the app. Nothing is written to the " +
        "fridge: the user must explicitly confirm the proposal in the UI.",
      inputSchema: proposeAddItemSchema,
      execute: (input) => {
        try {
          const budget = proposalBudgetExceeded();
          if (budget) return budget;

          const parsed = addItemProposalPayloadSchema.safeParse(input);
          if (!parsed.success) {
            return failure("Add-item payload failed validation.");
          }
          turn.proposals.push({ kind: "add_item", payload: parsed.data });
          return {
            ok: true,
            message:
              "Add proposal prepared (pending). Tell the user it needs " +
              "their confirmation — do not claim it was added.",
          };
        } catch (error) {
          console.error("proposeAddItem tool failed:", error);
          return failure("Internal tool failure.");
        }
      },
    }),

    proposeConsumption: tool({
      description:
        "After presenting a viable recipe, prepare an optional consumption " +
        "proposal describing how cooking it would reduce fridge units. Give " +
        "the new remaining level per unit ref; allowed levels are " +
        "100/75/50/25/0 and must be lower than the current level. If a " +
        "quantity cannot be mapped confidently to a quarter step, ask the " +
        "user instead of guessing. The user must confirm before anything " +
        "changes.",
      inputSchema: proposeConsumptionSchema,
      execute: (input) => {
        try {
          const budget = proposalBudgetExceeded();
          if (budget) return budget;

          const recipe =
            turn.turnRecipes.at(-1) ?? turn.historyRecipes.at(-1) ?? null;
          if (!recipe) {
            return failure(
              "No recipe in context — call proposeRecipe before proposing " +
                "consumption.",
            );
          }

          const seenRefs = new Set<string>();
          const problems: string[] = [];
          const consumptions: ConsumptionProposal[] = [];

          for (const entry of input.consumptions) {
            const item = turn.inventory.byRef.get(entry.itemRef);
            if (!item) {
              problems.push(`${entry.itemRef}: unknown ref.`);
              continue;
            }
            if (seenRefs.has(entry.itemRef)) {
              problems.push(`${entry.itemRef}: listed twice.`);
              continue;
            }
            seenRefs.add(entry.itemRef);
            if (entry.toPercent >= item.remainingPercent) {
              problems.push(
                `${entry.itemRef}: is at ${item.remainingPercent}%; propose ` +
                  "a lower remaining level.",
              );
              continue;
            }
            consumptions.push({
              itemId: item.itemId,
              productName: item.name,
              fromPercent: item.remainingPercent,
              toPercent: entry.toPercent,
            });
          }

          if (problems.length > 0) {
            return failure(`Fix these and retry: ${problems.join(" ")}`);
          }

          const parsed = consumeRecipeProposalPayloadSchema.safeParse({
            recipe,
            consumptions,
          });
          if (!parsed.success) {
            return failure("Consumption payload failed validation.");
          }

          turn.proposals.push({
            kind: "consume_recipe",
            payload: parsed.data,
          });
          return {
            ok: true,
            message:
              "Consumption proposal prepared (pending): " +
              consumptions
                .map(
                  (c) => `${c.productName} ${c.fromPercent}% → ${c.toPercent}%`,
                )
                .join(", ") +
              ". The user must confirm it — do not claim the fridge changed.",
          };
        } catch (error) {
          console.error("proposeConsumption tool failed:", error);
          return failure("Internal tool failure.");
        }
      },
    }),
  };
}
