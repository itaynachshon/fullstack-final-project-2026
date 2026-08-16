"use client";

import { cn } from "@/components/ui/utils";
import { levelLabel, unitChipAriaLabel } from "@/lib/fridge/format";
import type { RemainingLevel } from "@/lib/types";

import { LevelGauge } from "./LevelGauge";

/**
 * The core fridge control (docs/UI_DESIGN.md §6.3): one 44px pill per
 * physical fridge_items row — 4-segment mini-gauge + text fraction (never
 * color alone). At 25% the border shifts amber; at 0 the chip goes muted with
 * a "Finished" label. Tap opens the consumption sheet for exactly this unit.
 */
export function UnitChip({
  unitNumber,
  level,
  onClick,
  pending = false,
}: {
  unitNumber: number;
  level: RemainingLevel;
  onClick: () => void;
  pending?: boolean;
}) {
  const low = level === 25;
  const finished = level === 0;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={unitChipAriaLabel(unitNumber, level)}
      aria-haspopup="dialog"
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-full border bg-card px-3 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
        low ? "border-warning-foreground/40" : "border-border",
        finished ? "text-muted-foreground" : "text-foreground",
        pending ? "opacity-70" : "hover:border-ring/40",
      )}
    >
      <LevelGauge level={level} size="chip" />
      <span className="tabular-nums">{levelLabel(level)}</span>
    </button>
  );
}
