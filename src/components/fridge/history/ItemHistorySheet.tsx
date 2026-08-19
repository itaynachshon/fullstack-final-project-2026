"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/components/ui/utils";
import type { RemainingLevel } from "@/lib/types";
import type { ItemHistory } from "@/lib/v2";
import { getItemHistory } from "@/lib/v2/actions/history";

import {
  buildItemHistoryView,
  levelSummary,
  type LineageSourceState,
} from "./history-view";

/**
 * The unit details/history sheet (F1) — a sibling of the consume sheet,
 * opened from its "Unit history" row (docs/FEATURES_V2_PLAN.md §5.2). Bottom
 * sheet on phones, centered dialog from md up (via Modal).
 *
 * Everything shown is derived server-side by getItemHistory; when the unit
 * was created by Restock, the finished source unit's history is fetched
 * lazily (one extra call) to date the "Restocked from a unit finished on …"
 * line. Closing goes BACK to the consume sheet, mirroring how it opened.
 *
 * The fetching body mounts fresh per open/retry (state resets by remount, so
 * effects never set state synchronously), which also guarantees reopening
 * after a consumption shows fresh data.
 */

export interface HistorySheetUnit {
  id: string;
  unitNumber: number;
  remainingPercent: RemainingLevel;
}

export function ItemHistorySheet({
  open,
  onBack,
  productName,
  unit,
}: {
  open: boolean;
  onBack: () => void;
  productName: string;
  unit: HistorySheetUnit | null;
}) {
  const [attempt, setAttempt] = useState(0);

  return (
    <Modal
      open={open}
      onClose={onBack}
      variant="sheet"
      ariaLabel={`History of ${productName}`}
    >
      {unit && (
        <>
          <p dir="auto" className="text-base leading-snug font-medium">
            {productName}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Unit {unit.unitNumber} · {levelSummary(unit.remainingPercent)}
          </p>

          {open && (
            <HistoryContent
              key={`${unit.id}:${attempt}`}
              itemId={unit.id}
              onRetry={() => setAttempt((n) => n + 1)}
            />
          )}

          <Button variant="ghost" onClick={onBack} className="mt-4 w-full">
            Back
          </Button>
        </>
      )}
    </Modal>
  );
}

/* ─── Fetch + render body (one mount per open/retry) ─────────────────────── */

type Phase =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; history: ItemHistory };

function HistoryContent({
  itemId,
  onRetry,
}: {
  itemId: string;
  onRetry: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ status: "loading" });
  const [source, setSource] = useState<LineageSourceState>({
    loaded: false,
    finishedAt: null,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await getItemHistory({ itemId });
      if (cancelled) return;
      if (!result.ok) {
        setPhase({ status: "error" });
        return;
      }
      setPhase({ status: "ready", history: result.data });

      // Lineage: date the origin line from the source unit's own history.
      if (result.data.restockedFromItemId) {
        const sourceResult = await getItemHistory({
          itemId: result.data.restockedFromItemId,
        });
        if (cancelled) return;
        setSource({
          loaded: true,
          finishedAt: sourceResult.ok ? sourceResult.data.finishedAt : null,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [itemId]);

  if (phase.status === "loading") {
    return (
      <div className="mt-3 space-y-2" aria-label="Loading history">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  if (phase.status === "error") {
    return (
      <div className="mt-3 rounded-xl border px-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load this unit&apos;s history — check your connection.
        </p>
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  const view = buildItemHistoryView(phase.history, {
    now: new Date(),
    source,
  });

  return (
    <>
      <dl className="mt-3 overflow-hidden rounded-xl border">
        {view.facts.map((fact) => (
          <div
            key={fact.key}
            className="flex items-baseline justify-between gap-3 border-b px-4 py-2.5 last:border-b-0"
          >
            <dt className="shrink-0 text-xs text-muted-foreground">
              {fact.label}
            </dt>
            <dd className="text-end text-sm font-medium tabular-nums">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-4 text-xs font-medium tracking-wider text-muted-foreground uppercase">
        History
      </h3>
      <ul className="mt-2 space-y-1.5">
        {view.timeline.map((row) => (
          <li
            key={row.key}
            className="flex items-baseline justify-between gap-3 text-sm"
          >
            <span
              className={cn(
                "flex items-baseline gap-2",
                row.kind === "finished" && "text-muted-foreground",
              )}
            >
              <span aria-hidden="true" className="text-muted-foreground">
                •
              </span>
              {row.text}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {row.timeLabel}
            </span>
          </li>
        ))}
      </ul>
      {!view.hasEvents && (
        <p className="mt-2 text-xs text-muted-foreground">
          No consumption logged yet — set a level from the unit and it&apos;ll
          show up here.
        </p>
      )}
    </>
  );
}
