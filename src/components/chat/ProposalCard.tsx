import {
  ArrowDownRightIcon,
  CheckIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  XIcon,
} from "@/components/icons";
import { LevelGauge } from "@/components/fridge/LevelGauge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/utils";
import { levelLabel } from "@/lib/fridge/format";
import type { AIActionProposal, AIActionStatus } from "@/lib/v2/types";

/**
 * Review surface for an AI action proposal — the ONLY place a chat turn can
 * turn into a fridge mutation, and only through the explicit primary button
 * (which the parent wires to acceptAIAddProposal / acceptAIConsumptionProposal).
 *
 * The V2 contract is deliberately all-or-nothing: accept takes just the
 * proposalId and the server re-reads + re-validates the stored payload, so
 * there is no safe client-side editing/excluding of individual rows. The
 * card says so and points the user back to the conversation for changes.
 *
 * Non-pending proposals render read-only with a text status — no forever-
 * actionable stale cards. Database ids (proposal/item UUIDs) never render.
 */

const STATUS_META: Record<
  Exclude<AIActionStatus, "pending">,
  { label: string; Icon: typeof CheckIcon; className: string }
> = {
  accepted: { label: "Applied", Icon: CheckIcon, className: "text-primary" },
  rejected: {
    label: "Dismissed",
    Icon: XIcon,
    className: "text-muted-foreground",
  },
  expired: {
    label: "Expired",
    Icon: XIcon,
    className: "text-muted-foreground",
  },
};

export function ProposalCard({
  proposal,
  notice,
  busy = null,
  onAccept,
  onReject,
}: {
  proposal: AIActionProposal;
  /** Inline hint after a conflict refresh (fridge changed / handled elsewhere). */
  notice?: string;
  busy?: "accept" | "reject" | null;
  onAccept?: () => void;
  onReject?: () => void;
}) {
  const pending = proposal.status === "pending";
  const isAdd = proposal.kind === "add_item";

  return (
    <section
      className="rounded-xl border bg-card"
      aria-label={isAdd ? "Add to fridge proposal" : "Fridge update proposal"}
    >
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h3 className="text-sm font-semibold">
          {isAdd ? "Add to your fridge?" : "Update your fridge?"}
        </h3>
        {!pending ? <StatusChip status={proposal.status} /> : null}
      </header>

      <div className="px-4 py-3">
        {proposal.kind === "add_item" ? (
          <AddItemBody payload={proposal.payload} />
        ) : (
          <ConsumptionBody payload={proposal.payload} />
        )}
      </div>

      {notice ? (
        <p className="mx-4 mb-3 flex items-start gap-2 rounded-md bg-warning px-3 py-2 text-xs text-warning-foreground">
          <TriangleAlertIcon
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          {notice}
        </p>
      ) : null}

      {pending ? (
        <footer className="flex flex-col gap-2 border-t px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={onAccept}
              disabled={busy !== null}
              className="min-w-36 flex-1 sm:flex-none"
            >
              {busy === "accept" ? (
                <LoaderCircleIcon
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {isAdd ? "Add to fridge" : "Update fridge"}
            </Button>
            <Button
              variant="ghost"
              onClick={onReject}
              disabled={busy !== null}
              className="flex-1 sm:flex-none"
            >
              {busy === "reject" ? (
                <LoaderCircleIcon
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              Not now
            </Button>
          </div>
          {!isAdd ? (
            <p className="text-xs text-muted-foreground">
              Applies all changes above. Want something different? Tell the
              assistant.
            </p>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}

function StatusChip({ status }: { status: AIActionStatus }) {
  if (status === "pending") return null;
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 text-xs font-medium",
        meta.className,
      )}
    >
      <meta.Icon className="size-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function AddItemBody({
  payload,
}: {
  payload: Extract<AIActionProposal, { kind: "add_item" }>["payload"];
}) {
  const detail = [payload.brand, payload.packageSize]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="text-sm">
      <p dir="auto" className="font-medium break-words">
        {payload.name}
      </p>
      <p className="mt-0.5 text-muted-foreground">
        {payload.category}
        {detail ? (
          <>
            {" · "}
            <span dir="auto">{detail}</span>
          </>
        ) : null}
      </p>
      <p className="mt-1 text-muted-foreground">
        {payload.units === 1 ? "1 unit" : `${payload.units} units`}, added as
        Full
      </p>
    </div>
  );
}

function ConsumptionBody({
  payload,
}: {
  payload: Extract<AIActionProposal, { kind: "consume_recipe" }>["payload"];
}) {
  if (payload.consumptions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No fridge changes to apply.
      </p>
    );
  }
  return (
    <ul className="divide-y">
      {payload.consumptions.map((consumption, index) => (
        <li
          key={`${consumption.itemId}-${index}`}
          className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
        >
          <span dir="auto" className="min-w-0 text-sm font-medium break-words">
            {consumption.productName}
          </span>
          <span className="flex shrink-0 items-center gap-2 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <LevelGauge level={consumption.fromPercent} />
              {levelLabel(consumption.fromPercent)}
            </span>
            <ArrowDownRightIcon
              className="size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="flex items-center gap-1.5 font-medium">
              <LevelGauge level={consumption.toPercent} />
              {levelLabel(consumption.toPercent)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
