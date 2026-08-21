"use server";

/**
 * F3 — AI conversation reads and proposal accept/reject (replaces F0 stubs).
 *
 * Mutation safety model (docs/FEATURES_V2_PLAN.md §1.4, §7):
 * - Chat turns only ever create PENDING `ai_action_proposals`.
 * - These actions are the ONLY path that applies a proposal, and only after
 *   the signed-in owner explicitly invoked them (the "Confirm" tap in F4).
 * - Payloads are RE-READ from the database (column grants stop clients from
 *   rewriting payload post-insert) and validated against the frozen Zod
 *   schemas before any fridge call.
 * - Fridge writes go through the existing frozen actions
 *   (`createManualProduct`, `setRemaining`) under the caller's JWT — RLS
 *   re-checks ownership of every touched row.
 * - The pending → accepted transition is optimistic-locked (`eq status
 *   pending`) so double-taps and racing tabs cannot double-apply.
 */

import { setRemaining } from "@/lib/actions/fridge";
import { createManualProduct } from "@/lib/actions/products";
import {
  listConversationSummaries,
  loadMessages,
  loadProposals,
  getConversationSummary,
  mapProposalRow,
  type DbClient,
  type ProposalRow,
} from "@/lib/ai/conversation";
import { createClient } from "@/lib/supabase/server";
import {
  acceptAIProposalSchema,
  addItemProposalPayloadSchema,
  consumeRecipeProposalPayloadSchema,
  getAIConversationSchema,
  rejectAIProposalSchema,
} from "@/lib/v2/schemas";
import type {
  AcceptAIAddProposalData,
  AcceptAIConsumptionProposalData,
  AcceptAIProposalInput,
  AIConversationDetail,
  AIConversationSummary,
  GetAIConversationInput,
  RejectAIProposalData,
  V2ActionResult,
} from "@/lib/v2/types";

const PROPOSAL_SELECT =
  "id, conversation_id, user_id, kind, payload, status, created_at, updated_at";

/* ─── Reads ───────────────────────────────────────────────────────────────── */

export async function listAIConversations(): Promise<
  V2ActionResult<AIConversationSummary[]>
> {
  const gate = await requireUser();
  if (!gate.ok) return gate.failure;
  try {
    return { ok: true, data: await listConversationSummaries(gate.supabase) };
  } catch (error) {
    return internal("listAIConversations failed", error);
  }
}

export async function getAIConversation(
  input: GetAIConversationInput,
): Promise<V2ActionResult<AIConversationDetail>> {
  const gate = await requireUser();
  if (!gate.ok) return gate.failure;
  const parsed = getAIConversationSchema.safeParse(input);
  if (!parsed.success) return validation();

  try {
    const summary = await getConversationSummary(
      gate.supabase,
      parsed.data.conversationId,
    );
    if (!summary) return notFound("That conversation doesn't exist.");
    const [messages, proposals] = await Promise.all([
      loadMessages(gate.supabase, summary.id),
      loadProposals(gate.supabase, summary.id),
    ]);
    return { ok: true, data: { ...summary, messages, proposals } };
  } catch (error) {
    return internal("getAIConversation failed", error);
  }
}

/* ─── Accept / reject ─────────────────────────────────────────────────────── */

export async function acceptAIAddProposal(
  input: AcceptAIProposalInput,
): Promise<V2ActionResult<AcceptAIAddProposalData>> {
  const gate = await requireUser();
  if (!gate.ok) return gate.failure;
  const parsed = acceptAIProposalSchema.safeParse(input);
  if (!parsed.success) return validation();
  const { supabase } = gate;
  const proposalId = parsed.data.proposalId;

  const loaded = await loadProposal(supabase, proposalId);
  if (!loaded.ok) return loaded.failure;
  const row = loaded.row;

  if (row.kind !== "add_item") {
    return validation("That proposal isn't an add-item proposal.");
  }
  if (row.status !== "pending") return conflict();

  // Re-read + re-validate the payload from the database, never from input.
  const payload = addItemProposalPayloadSchema.safeParse(row.payload);
  if (!payload.success) {
    return internal("acceptAIAddProposal invalid stored payload", null);
  }

  // Claim the proposal first so a racing accept cannot double-apply.
  const claimed = await transitionStatus(
    supabase,
    proposalId,
    "pending",
    "accepted",
  );
  if (claimed === "error")
    return internal("acceptAIAddProposal claim failed", null);
  if (claimed === "missed") return conflict();

  const result = await createManualProduct({
    name: payload.data.name,
    barcode: payload.data.barcode,
    brand: payload.data.brand,
    packageSize: payload.data.packageSize,
    category: payload.data.category,
    addUnits: payload.data.units,
  });

  if (!result.ok) {
    await revertStatus(supabase, proposalId);
    return { ok: false, error: result.error };
  }

  return {
    ok: true,
    data: { proposalId, itemIds: result.data.itemIds },
  };
}

export async function acceptAIConsumptionProposal(
  input: AcceptAIProposalInput,
): Promise<V2ActionResult<AcceptAIConsumptionProposalData>> {
  const gate = await requireUser();
  if (!gate.ok) return gate.failure;
  const parsed = acceptAIProposalSchema.safeParse(input);
  if (!parsed.success) return validation();
  const { supabase } = gate;
  const proposalId = parsed.data.proposalId;

  const loaded = await loadProposal(supabase, proposalId);
  if (!loaded.ok) return loaded.failure;
  const row = loaded.row;

  if (row.kind !== "consume_recipe") {
    return validation("That proposal isn't a consumption proposal.");
  }
  if (row.status !== "pending") return conflict();

  const payload = consumeRecipeProposalPayloadSchema.safeParse(row.payload);
  if (!payload.success) {
    return internal("acceptAIConsumptionProposal invalid stored payload", null);
  }
  const consumptions = payload.data.consumptions;

  const claimed = await transitionStatus(
    supabase,
    proposalId,
    "pending",
    "accepted",
  );
  if (claimed === "error") {
    return internal("acceptAIConsumptionProposal claim failed", null);
  }
  if (claimed === "missed") return conflict();

  // Server-side validation against the CURRENT fridge: every referenced item
  // must still exist (RLS: and be the caller's) at the proposed level. A
  // stale proposal is rejected instead of applying surprising transitions.
  for (const consumption of consumptions) {
    const { data: item, error } = await supabase
      .from("fridge_items")
      .select("id, remaining_percent")
      .eq("id", consumption.itemId)
      .maybeSingle();
    if (error) {
      await revertStatus(supabase, proposalId);
      return internal("acceptAIConsumptionProposal read failed", error);
    }
    if (!item || item.remaining_percent !== consumption.fromPercent) {
      await revertStatus(supabase, proposalId);
      return conflict(
        "Your fridge changed since this was proposed — ask the assistant again.",
      );
    }
  }

  // Apply through the frozen action (event log + finished_at semantics).
  const applied: typeof consumptions = [];
  for (const consumption of consumptions) {
    const result = await setRemaining({
      itemId: consumption.itemId,
      remainingPercent: consumption.toPercent,
    });
    if (!result.ok) {
      // Best-effort compensation of the prefix, newest first.
      for (const done of [...applied].reverse()) {
        const revert = await setRemaining({
          itemId: done.itemId,
          remainingPercent: done.fromPercent,
        });
        if (!revert.ok) {
          console.error(
            `acceptAIConsumptionProposal compensation failed for ${done.itemId}`,
          );
        }
      }
      await revertStatus(supabase, proposalId);
      return { ok: false, error: result.error };
    }
    applied.push(consumption);
  }

  return {
    ok: true,
    data: {
      proposalId,
      itemIds: consumptions.map((consumption) => consumption.itemId),
    },
  };
}

export async function rejectAIProposal(
  input: AcceptAIProposalInput,
): Promise<V2ActionResult<RejectAIProposalData>> {
  const gate = await requireUser();
  if (!gate.ok) return gate.failure;
  const parsed = rejectAIProposalSchema.safeParse(input);
  if (!parsed.success) return validation();
  const { supabase } = gate;
  const proposalId = parsed.data.proposalId;

  const transitioned = await transitionStatus(
    supabase,
    proposalId,
    "pending",
    "rejected",
  );
  if (transitioned === "error") {
    return internal("rejectAIProposal update failed", null);
  }
  if (transitioned === "done") {
    return { ok: true, data: { proposalId, status: "rejected" } };
  }

  // Nothing transitioned: either not ours/nonexistent, or already resolved.
  const loaded = await loadProposal(supabase, proposalId);
  if (!loaded.ok) return loaded.failure;
  return conflict();
}

/* ─── Shared internals ────────────────────────────────────────────────────── */

type UserGate =
  | { ok: true; supabase: DbClient; userId: string }
  | { ok: false; failure: V2ActionResult<never> };

async function requireUser(): Promise<UserGate> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      failure: {
        ok: false,
        error: {
          code: "unauthenticated",
          message: "You must be signed in to do that.",
        },
      },
    };
  }
  return { ok: true, supabase, userId: user.id };
}

type LoadedProposal =
  | { ok: true; row: ProposalRow }
  | { ok: false; failure: V2ActionResult<never> };

/** RLS makes a foreign proposal invisible → reported as not_found. */
async function loadProposal(
  supabase: DbClient,
  proposalId: string,
): Promise<LoadedProposal> {
  const { data, error } = await supabase
    .from("ai_action_proposals")
    .select(PROPOSAL_SELECT)
    .eq("id", proposalId)
    .maybeSingle();
  if (error) {
    return {
      ok: false,
      failure: internal("loadProposal failed", error),
    };
  }
  if (!data || !mapProposalRow(data as ProposalRow)) {
    return {
      ok: false,
      failure: notFound("That proposal doesn't exist."),
    };
  }
  return { ok: true, row: data as ProposalRow };
}

/**
 * Optimistic-locked status transition. Only (status, updated_at) are
 * writable for authenticated clients (column grant) — payload is immutable.
 */
async function transitionStatus(
  supabase: DbClient,
  proposalId: string,
  from: "pending",
  to: "accepted" | "rejected",
): Promise<"done" | "missed" | "error"> {
  const { data, error } = await supabase
    .from("ai_action_proposals")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("status", from)
    .select("id");
  if (error) {
    console.error("transitionStatus failed:", error);
    return "error";
  }
  return (data ?? []).length > 0 ? "done" : "missed";
}

async function revertStatus(
  supabase: DbClient,
  proposalId: string,
): Promise<void> {
  const { error } = await supabase
    .from("ai_action_proposals")
    .update({ status: "pending", updated_at: new Date().toISOString() })
    .eq("id", proposalId);
  if (error) {
    console.error("revertStatus failed (proposal stuck as accepted):", error);
  }
}

function validation(message = "Invalid input."): V2ActionResult<never> {
  return { ok: false, error: { code: "validation", message } };
}

function notFound(message: string): V2ActionResult<never> {
  return { ok: false, error: { code: "not_found", message } };
}

function conflict(
  message = "That proposal was already handled.",
): V2ActionResult<never> {
  return { ok: false, error: { code: "conflict", message } };
}

function internal(context: string, error: unknown): V2ActionResult<never> {
  console.error(`${context}:`, error);
  return {
    ok: false,
    error: {
      code: "internal",
      message: "Something went wrong on our side — try again.",
    },
  };
}
