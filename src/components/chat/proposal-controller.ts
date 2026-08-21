/**
 * Framework-free controller for accepting/rejecting AI action proposals.
 * Dependencies are injected so unit tests can assert *which* server action a
 * given user gesture triggers — the core safety property: nothing mutates the
 * fridge except an explicit confirmation calling the trusted F3 action.
 *
 * Server semantics this mirrors (src/lib/v2/actions/ai.ts):
 * - `conflict`: proposal was resolved elsewhere OR the fridge changed under a
 *   consumption proposal (server reverts it to pending). Either way the local
 *   copy is stale → refresh, then show the server's message if still pending.
 * - accept failure after claim (e.g. partial consumption): the server
 *   compensates best-effort and reverts the proposal to pending; the returned
 *   error is user-safe. Never report success in that case.
 */

import type {
  AcceptAIAddProposalData,
  AcceptAIConsumptionProposalData,
  AcceptAIProposalInput,
  RejectAIProposalData,
  V2ActionResult,
} from "@/lib/v2/types";

import { COPY } from "./copy";

export interface ProposalControllerDeps {
  acceptAdd: (
    input: AcceptAIProposalInput,
  ) => Promise<V2ActionResult<AcceptAIAddProposalData>>;
  acceptConsumption: (
    input: AcceptAIProposalInput,
  ) => Promise<V2ActionResult<AcceptAIConsumptionProposalData>>;
  reject: (
    input: AcceptAIProposalInput,
  ) => Promise<V2ActionResult<RejectAIProposalData>>;
  /** Reload the conversation detail into local state (server truth). */
  refreshConversation: () => Promise<void>;
}

export type ProposalGestureOutcome =
  | { kind: "accepted"; toast: string }
  | { kind: "rejected" }
  | {
      /** Local copy was stale; a refresh already ran. */
      kind: "conflict";
      message: string;
    }
  | {
      /** Accept/reject failed; server compensated. Proposal usable again. */
      kind: "error";
      message: string;
    }
  | { kind: "signed_out" };

export async function acceptProposal(
  proposalKind: "add_item" | "consume_recipe",
  proposalId: string,
  deps: ProposalControllerDeps,
): Promise<ProposalGestureOutcome> {
  const result =
    proposalKind === "add_item"
      ? await deps.acceptAdd({ proposalId })
      : await deps.acceptConsumption({ proposalId });

  if (result.ok) {
    return {
      kind: "accepted",
      toast:
        proposalKind === "add_item"
          ? COPY.addAccepted
          : COPY.consumptionAccepted,
    };
  }
  return classifyFailure(result.error, deps);
}

export async function rejectProposal(
  proposalId: string,
  deps: ProposalControllerDeps,
): Promise<ProposalGestureOutcome> {
  const result = await deps.reject({ proposalId });
  if (result.ok) return { kind: "rejected" };
  return classifyFailure(result.error, deps);
}

async function classifyFailure(
  error: { code: string; message: string },
  deps: ProposalControllerDeps,
): Promise<ProposalGestureOutcome> {
  switch (error.code) {
    case "unauthenticated":
      return { kind: "signed_out" };
    case "conflict":
    case "not_found":
      // Pull server truth so the card reflects the real status.
      await deps.refreshConversation();
      return {
        kind: "conflict",
        message: error.message || COPY.staleProposal,
      };
    default:
      return {
        kind: "error",
        message: error.message || COPY.turnInternalError,
      };
  }
}
