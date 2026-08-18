"use server";

/**
 * F3 contract — AI conversation reads and proposal accept/reject.
 * Stub bodies; F3 replaces them in this file only (docs/FEATURES_V2_PLAN.md §5.4).
 *
 * Accept handlers MUST re-read payload from the database and call existing
 * fridge/product actions. Chat turns never mutate the fridge.
 */

import { notImplemented } from "@/lib/v2/not-implemented";
import {
  acceptAIProposalSchema,
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

export async function listAIConversations(): Promise<
  V2ActionResult<AIConversationSummary[]>
> {
  return notImplemented("Recipe AI chat");
}

export async function getAIConversation(
  input: GetAIConversationInput,
): Promise<V2ActionResult<AIConversationDetail>> {
  const parsed = getAIConversationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation", message: "Invalid input." },
    };
  }
  return notImplemented("Recipe AI chat");
}

export async function acceptAIAddProposal(
  input: AcceptAIProposalInput,
): Promise<V2ActionResult<AcceptAIAddProposalData>> {
  const parsed = acceptAIProposalSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation", message: "Invalid input." },
    };
  }
  return notImplemented("Recipe AI chat");
}

export async function acceptAIConsumptionProposal(
  input: AcceptAIProposalInput,
): Promise<V2ActionResult<AcceptAIConsumptionProposalData>> {
  const parsed = acceptAIProposalSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation", message: "Invalid input." },
    };
  }
  return notImplemented("Recipe AI chat");
}

export async function rejectAIProposal(
  input: AcceptAIProposalInput,
): Promise<V2ActionResult<RejectAIProposalData>> {
  const parsed = rejectAIProposalSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation", message: "Invalid input." },
    };
  }
  return notImplemented("Recipe AI chat");
}
