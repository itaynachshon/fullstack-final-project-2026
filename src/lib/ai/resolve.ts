/**
 * Ref → database-id resolution for provider output.
 *
 * Providers draft parts and proposals in terms of opaque per-turn refs
 * (they never see database ids). Before anything is persisted, the
 * orchestrator resolves those drafts against the SAME TurnInventory the
 * refs were minted from and validates the results with the frozen Zod
 * schemas.
 *
 * Tools already reject refs that are not in the snapshot, so a resolution
 * failure here indicates an adapter bug — it throws UnresolvedDraftError,
 * which the orchestrator reports as `internal` (never as a provider
 * outage, and nothing gets persisted from the broken turn).
 */

import {
  addItemProposalPayloadSchema,
  consumeRecipeProposalPayloadSchema,
} from "@/lib/v2/schemas";
import type {
  AICompletionPart,
  AICompletionProposal,
  AIIngredientDraft,
  AIMessagePart,
  AIRecipeDraft,
  ConsumptionProposal,
  Recipe,
  RecipeIngredient,
} from "@/lib/v2/types";

import type { StoredProposalDraft, TurnInventory } from "./types";

/** A drafted part/proposal could not be resolved — application bug. */
export class UnresolvedDraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnresolvedDraftError";
  }
}

function resolveIngredient(
  draft: AIIngredientDraft,
  inventory: TurnInventory,
): RecipeIngredient {
  const matchedItemIds = draft.matchedItemRefs.map((ref) => {
    const item = inventory.byRef.get(ref);
    if (!item) {
      throw new UnresolvedDraftError(
        `Ingredient "${draft.name}" references unknown ref "${ref}".`,
      );
    }
    return item.itemId;
  });
  return {
    name: draft.name,
    quantity: draft.quantity,
    optional: draft.optional,
    matchedItemIds,
    availability: draft.availability,
  };
}

export function resolveRecipeDraft(
  draft: AIRecipeDraft,
  inventory: TurnInventory,
): Recipe {
  return {
    title: draft.title,
    servings: draft.servings,
    instructions: draft.instructions,
    ingredients: draft.ingredients.map((ingredient) =>
      resolveIngredient(ingredient, inventory),
    ),
    notes: draft.notes,
  };
}

/** Drafted parts → frozen persisted parts (text passes through untouched). */
export function resolveCompletionParts(
  parts: AICompletionPart[],
  inventory: TurnInventory,
): AIMessagePart[] {
  return parts.map((part): AIMessagePart => {
    switch (part.type) {
      case "text":
        return part;
      case "recipe":
        return {
          type: "recipe",
          recipe: resolveRecipeDraft(part.recipe, inventory),
        };
      case "missing_ingredient":
        return {
          type: "missing_ingredient",
          ingredient: resolveIngredient(part.ingredient, inventory),
          question: part.question,
        };
    }
  });
}

/**
 * Drafted proposals → persist-ready payloads. `fromPercent` / `productName`
 * come from the snapshot (server truth), never from the model, and every
 * payload is re-validated against its frozen schema before it may be
 * inserted as a pending ai_action_proposals row.
 */
export function resolveCompletionProposals(
  proposals: AICompletionProposal[],
  inventory: TurnInventory,
): StoredProposalDraft[] {
  return proposals.map((proposal): StoredProposalDraft => {
    if (proposal.kind === "add_item") {
      const payload = addItemProposalPayloadSchema.safeParse(proposal.payload);
      if (!payload.success) {
        throw new UnresolvedDraftError("Add-item draft failed validation.");
      }
      return { kind: "add_item", payload: payload.data };
    }

    const consumptions = proposal.payload.consumptions.map(
      (draft): ConsumptionProposal => {
        const item = inventory.byRef.get(draft.ref);
        if (!item) {
          throw new UnresolvedDraftError(
            `Consumption draft references unknown ref "${draft.ref}".`,
          );
        }
        if (draft.toPercent >= item.remainingPercent) {
          throw new UnresolvedDraftError(
            `Consumption draft for "${draft.ref}" does not lower the level.`,
          );
        }
        return {
          itemId: item.itemId,
          productName: item.name,
          fromPercent: item.remainingPercent,
          toPercent: draft.toPercent,
        };
      },
    );

    const payload = consumeRecipeProposalPayloadSchema.safeParse({
      recipe: resolveRecipeDraft(proposal.payload.recipe, inventory),
      consumptions,
    });
    if (!payload.success) {
      throw new UnresolvedDraftError("Consumption draft failed validation.");
    }
    return { kind: "consume_recipe", payload: payload.data };
  });
}
