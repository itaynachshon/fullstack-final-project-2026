"use client";

import { useState } from "react";

import {
  CheckIcon,
  CircleCheckIcon,
  HistoryIcon,
  Trash2Icon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/components/ui/utils";
import { levelLabel, shortDate } from "@/lib/fridge/format";
import { REMAINING_LEVELS } from "@/lib/types";
import type { RemainingLevel } from "@/lib/types";

import { ItemHistorySheet } from "./history/ItemHistorySheet";
import { LevelGauge } from "./LevelGauge";

/**
 * The consumption sheet (docs/UI_DESIGN.md §8): five 52px one-tap rows —
 * Full / ¾ / ½ / ¼ above a divider, Finished below it (muted, never red:
 * finishing food is success, not damage) — plus the app's only delete path,
 * a destructive text row deliberately distant from the level options, guarded
 * by a confirm dialog that names the object.
 *
 * A "Unit history" row (F1) swaps this sheet for the sibling ItemHistorySheet
 * — the details/timeline view for exactly this physical unit; closing it
 * returns here, so the consume flow itself is untouched.
 *
 * Semantically a radio group labeled by the product name; the current level
 * is checked, aria-current, and non-interactive (double-tap idempotence
 * guard). Bottom sheet on phones, centered dialog from md up (via Modal).
 */

const DESCENDING_LIVE_LEVELS = [...REMAINING_LEVELS]
  .sort((a, b) => b - a)
  .filter((level) => level !== 0) as RemainingLevel[];

export interface ConsumeSheetUnit {
  id: string;
  unitNumber: number;
  remainingPercent: RemainingLevel;
  addedAt: string;
}

export function ConsumeSheet({
  open,
  onClose,
  productName,
  unit,
  onSelectLevel,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  productName: string;
  unit: ConsumeSheetUnit | null;
  /** Parent runs the optimistic update + server action + toasts. */
  onSelectLevel: (level: RemainingLevel) => void;
  /** Parent runs the delete action; called only after the confirm dialog. */
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showingHistory, setShowingHistory] = useState(false);

  const close = () => {
    setConfirmingDelete(false);
    setShowingHistory(false);
    onClose();
  };

  return (
    <>
      <Modal
        open={open && !confirmingDelete && !showingHistory}
        onClose={close}
        variant="sheet"
        ariaLabel={`Set remaining amount of ${productName}`}
      >
        {unit && (
          <>
            <p dir="auto" className="text-base leading-snug font-medium">
              {productName}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Unit {unit.unitNumber} · added {shortDate(new Date(unit.addedAt))}
            </p>

            <div
              role="radiogroup"
              aria-label={`Remaining amount of ${productName}`}
              className="mt-3 overflow-hidden rounded-xl border"
            >
              {DESCENDING_LIVE_LEVELS.map((level) => (
                <LevelRow
                  key={level}
                  level={level}
                  current={unit.remainingPercent === level}
                  onSelect={() => onSelectLevel(level)}
                />
              ))}
              <div className="border-t" role="none" />
              <LevelRow
                level={0}
                current={unit.remainingPercent === 0}
                onSelect={() => onSelectLevel(0)}
              />
            </div>

            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setShowingHistory(true)}
              className="mt-3 flex h-13 w-full items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors duration-150 outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
            >
              <HistoryIcon className="size-4 text-muted-foreground" />
              Unit history
            </button>

            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="mt-3 flex h-13 w-full items-center gap-2 rounded-xl border px-4 text-sm font-medium text-destructive transition-colors duration-150 outline-none hover:bg-destructive/8 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
            >
              <Trash2Icon className="size-4" />
              Remove this unit
            </button>
          </>
        )}
      </Modal>

      <ItemHistorySheet
        open={open && showingHistory}
        onBack={() => setShowingHistory(false)}
        productName={productName}
        unit={unit}
      />

      <Modal
        open={open && confirmingDelete}
        onClose={close}
        variant="dialog"
        ariaLabel={`Remove this unit of ${productName}?`}
      >
        <p dir="auto" className="text-base font-semibold">
          Remove this unit of {productName}?
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Its history goes with it.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setConfirmingDelete(false);
              onDelete();
            }}
          >
            Remove
          </Button>
        </div>
      </Modal>
    </>
  );
}

function LevelRow({
  level,
  current,
  onSelect,
}: {
  level: RemainingLevel;
  current: boolean;
  onSelect: () => void;
}) {
  const finished = level === 0;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={current}
      aria-current={current || undefined}
      disabled={current}
      onClick={onSelect}
      className={cn(
        // ring-inset: the row sits inside an overflow-hidden rounded group,
        // so an offset ring would be clipped.
        "flex h-13 w-full items-center gap-3 border-b px-4 text-start transition-colors duration-150 outline-none last:border-b-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none",
        current ? "bg-accent" : "hover:bg-accent/60",
        finished && "text-muted-foreground",
      )}
    >
      {finished ? (
        <CircleCheckIcon className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <LevelGauge level={level} size="row" className="shrink-0" />
      )}
      <span className="flex-1 text-base font-medium">
        {finished ? "Finished — all gone" : levelLabel(level)}
      </span>
      {current ? (
        <CheckIcon className="size-4 shrink-0 text-primary" />
      ) : (
        <span className="text-xs text-muted-foreground tabular-nums">
          {level} %
        </span>
      )}
    </button>
  );
}
