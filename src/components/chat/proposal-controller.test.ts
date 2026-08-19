import { describe, expect, it, vi } from "vitest";

import type { V2ActionErrorCode, V2ActionResult } from "@/lib/v2/types";

import { COPY } from "./copy";
import {
  acceptProposal,
  rejectProposal,
  type ProposalControllerDeps,
} from "./proposal-controller";

const PROPOSAL_ID = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

function makeDeps(
  overrides: Partial<ProposalControllerDeps> = {},
): ProposalControllerDeps {
  return {
    acceptAdd: vi.fn(async () => ({
      ok: true as const,
      data: { proposalId: PROPOSAL_ID, itemIds: [] as string[] },
    })),
    acceptConsumption: vi.fn(async () => ({
      ok: true as const,
      data: { proposalId: PROPOSAL_ID, itemIds: [] as string[] },
    })),
    reject: vi.fn(async () => ({
      ok: true as const,
      data: { proposalId: PROPOSAL_ID, status: "rejected" as const },
    })),
    refreshConversation: vi.fn(async () => {}),
    ...overrides,
  };
}

function failure(
  code: V2ActionErrorCode,
  message: string,
): Promise<V2ActionResult<never>> {
  return Promise.resolve({ ok: false, error: { code, message } });
}

describe("accepting proposals", () => {
  it("confirming an add proposal calls acceptAIAddProposal and nothing else", async () => {
    const deps = makeDeps();
    const outcome = await acceptProposal("add_item", PROPOSAL_ID, deps);

    expect(deps.acceptAdd).toHaveBeenCalledExactlyOnceWith({
      proposalId: PROPOSAL_ID,
    });
    expect(deps.acceptConsumption).not.toHaveBeenCalled();
    expect(deps.reject).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: "accepted", toast: COPY.addAccepted });
  });

  it("confirming a consumption proposal calls acceptAIConsumptionProposal", async () => {
    const deps = makeDeps();
    const outcome = await acceptProposal("consume_recipe", PROPOSAL_ID, deps);

    expect(deps.acceptConsumption).toHaveBeenCalledExactlyOnceWith({
      proposalId: PROPOSAL_ID,
    });
    expect(deps.acceptAdd).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      kind: "accepted",
      toast: COPY.consumptionAccepted,
    });
  });

  it("a stale/conflicting proposal triggers a server-truth refresh", async () => {
    const deps = makeDeps({
      acceptConsumption: vi.fn(() =>
        failure(
          "conflict",
          "Your fridge changed since this was proposed — ask the assistant again.",
        ),
      ),
    });
    const outcome = await acceptProposal("consume_recipe", PROPOSAL_ID, deps);

    expect(deps.refreshConversation).toHaveBeenCalledOnce();
    expect(outcome).toEqual({
      kind: "conflict",
      message:
        "Your fridge changed since this was proposed — ask the assistant again.",
    });
  });

  it("a vanished proposal (not_found) also refreshes", async () => {
    const deps = makeDeps({
      acceptAdd: vi.fn(() =>
        failure("not_found", "That proposal doesn't exist."),
      ),
    });
    const outcome = await acceptProposal("add_item", PROPOSAL_ID, deps);

    expect(deps.refreshConversation).toHaveBeenCalledOnce();
    expect(outcome.kind).toBe("conflict");
  });

  it("a compensated partial failure surfaces an honest error — never success", async () => {
    const deps = makeDeps({
      acceptConsumption: vi.fn(() =>
        failure("internal", "Something went wrong on our side — try again."),
      ),
    });
    const outcome = await acceptProposal("consume_recipe", PROPOSAL_ID, deps);

    expect(outcome).toEqual({
      kind: "error",
      message: "Something went wrong on our side — try again.",
    });
    expect(deps.refreshConversation).not.toHaveBeenCalled();
  });

  it("an expired session maps to signed_out", async () => {
    const deps = makeDeps({
      acceptAdd: vi.fn(() =>
        failure("unauthenticated", "Authentication required."),
      ),
    });
    const outcome = await acceptProposal("add_item", PROPOSAL_ID, deps);

    expect(outcome).toEqual({ kind: "signed_out" });
  });
});

describe("rejecting proposals", () => {
  it("cancel calls rejectAIProposal and never an accept action", async () => {
    const deps = makeDeps();
    const outcome = await rejectProposal(PROPOSAL_ID, deps);

    expect(deps.reject).toHaveBeenCalledExactlyOnceWith({
      proposalId: PROPOSAL_ID,
    });
    expect(deps.acceptAdd).not.toHaveBeenCalled();
    expect(deps.acceptConsumption).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: "rejected" });
  });

  it("rejecting an already-handled proposal refreshes instead of pretending", async () => {
    const deps = makeDeps({
      reject: vi.fn(() =>
        failure("conflict", "That proposal was already handled."),
      ),
    });
    const outcome = await rejectProposal(PROPOSAL_ID, deps);

    expect(deps.refreshConversation).toHaveBeenCalledOnce();
    expect(outcome).toEqual({
      kind: "conflict",
      message: "That proposal was already handled.",
    });
  });
});
