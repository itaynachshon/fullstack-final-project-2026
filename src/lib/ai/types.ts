/**
 * F3-internal AI types. The provider-facing contracts live in
 * src/lib/v2/types.ts; this file only adds what those shapes cannot express.
 *
 * The F0 contract gap (frozen `AICompletionRequest.fridge` could not carry
 * product metadata) was resolved by the convergence commit: providers now
 * receive `AIInventoryUnit[]` — an explicitly safe, ref-based snapshot —
 * and the ref → database-id mapping (`TurnInventory`) stays in the
 * orchestrator. No structural-superset casts remain.
 */

import type { Product, RemainingLevel } from "@/lib/types";
import type {
  AddItemProposalPayload,
  AICompletionPart,
  AICompletionProposal,
  AIInventoryUnit,
  AIRecipeDraft,
  ConsumeRecipeProposalPayload,
  FridgeItemWithLineage,
} from "@/lib/v2/types";

/** A live fridge unit with its product embed — what the orchestrator loads. */
export type AIFridgeUnit = FridgeItemWithLineage & { product: Product };

/**
 * One unit in the server-side snapshot: the safe provider-facing fields
 * plus the database id needed to resolve refs back after the turn.
 */
export interface SnapshotItem {
  /** Opaque per-turn handle, e.g. "item_3". */
  ref: string;
  /** Server-side UUID; never part of the provider request. */
  itemId: string;
  name: string;
  brand: string | null;
  packageSize: string | null;
  category: string;
  remainingPercent: RemainingLevel;
}

/**
 * Immutable per-turn snapshot, built ONCE by the orchestrator so every
 * provider attempt in a failover chain sees identical refs. Holds the only
 * ref → database-id mapping; it is never given to a provider.
 */
export interface TurnInventory {
  items: SnapshotItem[];
  byRef: ReadonlyMap<string, SnapshotItem>;
}

/** Ref-keyed view of the safe units — all a provider adapter works with. */
export interface ProviderInventory {
  units: AIInventoryUnit[];
  byRef: ReadonlyMap<string, AIInventoryUnit>;
}

/** Parts a turn can stash through tools (text is added from the final step). */
export type StashedPart = Extract<
  AICompletionPart,
  { type: "recipe" } | { type: "missing_ingredient" }
>;

/**
 * Persist-ready proposal draft (payload uses database ids) — the output of
 * the orchestrator's ref resolution and the input to insertProposals.
 */
export type StoredProposalDraft =
  | { kind: "add_item"; payload: AddItemProposalPayload }
  | { kind: "consume_recipe"; payload: ConsumeRecipeProposalPayload };

/**
 * Mutable state for one provider attempt. Tools write into it; the adapter
 * assembles the provider-neutral AICompletionResponse from it afterwards.
 * A fresh TurnState is created per attempt, so a failed provider leaves no
 * residue in the replayed context. Everything here is ref-based.
 */
export interface TurnState {
  inventory: ProviderInventory;
  /** Recipes from earlier assistant messages (oldest → newest). */
  historyRecipes: AIRecipeDraft[];
  /** Recipe proposed during THIS turn (latest wins for consumption). */
  turnRecipes: AIRecipeDraft[];
  parts: StashedPart[];
  proposals: AICompletionProposal[];
}
