/**
 * F3-internal AI types. The frozen contracts live in src/lib/v2/types.ts;
 * this file only adds what the frozen shapes cannot express.
 *
 * KNOWN CONTRACT GAP (report for F5): the frozen
 * `AICompletionRequest.fridge: FridgeItemWithLineage[]` cannot carry product
 * metadata (name/brand/category), which recipe reasoning needs. F3 keeps the
 * frozen interface intact and passes `AIFridgeUnit` values — a structural
 * subtype that adds `product` — then narrows with the `hasProduct` guard
 * inside the adapter (src/lib/ai/snapshot.ts). Suggested F5 fix: widen the
 * frozen field to include the product embed.
 */

import type { Product, RemainingLevel } from "@/lib/types";
import type {
  AddItemProposalPayload,
  AIMessagePart,
  ConsumeRecipeProposalPayload,
  FridgeItemWithLineage,
  Recipe,
} from "@/lib/v2/types";

/** A live fridge unit with its product embed — what the orchestrator loads. */
export type AIFridgeUnit = FridgeItemWithLineage & { product: Product };

/**
 * One unit as exposed to the model: an opaque per-turn ref instead of the
 * database UUID (privacy boundary — UUIDs never reach a vendor).
 */
export interface SnapshotItem {
  /** Opaque per-turn handle, e.g. "item_3". */
  ref: string;
  /** Server-side UUID; never serialized for the model. */
  itemId: string;
  name: string;
  brand: string | null;
  packageSize: string | null;
  category: string;
  remainingPercent: RemainingLevel;
}

/** Immutable per-turn inventory snapshot with ref lookups. */
export interface TurnInventory {
  items: SnapshotItem[];
  byRef: ReadonlyMap<string, SnapshotItem>;
  byItemId: ReadonlyMap<string, SnapshotItem>;
}

/** Parts a turn can stash through tools (text is added from the final step). */
export type StashedPart = Extract<
  AIMessagePart,
  { type: "recipe" } | { type: "missing_ingredient" }
>;

export type ProposalDraft =
  | { kind: "add_item"; payload: AddItemProposalPayload }
  | { kind: "consume_recipe"; payload: ConsumeRecipeProposalPayload };

/**
 * Mutable state for one provider attempt. Tools write into it; the adapter
 * assembles the provider-neutral AICompletionResponse from it afterwards.
 * A fresh TurnState is created per attempt, so a failed provider leaves no
 * residue in the replayed context.
 */
export interface TurnState {
  inventory: TurnInventory;
  /** Recipes from earlier assistant messages (oldest → newest). */
  historyRecipes: Recipe[];
  /** Recipe proposed during THIS turn (latest wins for consumption). */
  turnRecipes: Recipe[];
  parts: StashedPart[];
  proposals: ProposalDraft[];
}
