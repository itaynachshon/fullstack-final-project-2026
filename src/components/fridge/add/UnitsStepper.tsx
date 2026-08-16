"use client";

import { MinusIcon, PlusIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

/** Frozen schema bounds: 1–20 units per add (src/lib/schemas.ts). */
export const MIN_UNITS = 1;
export const MAX_UNITS = 20;

/**
 * Units stepper (docs/UI_DESIGN.md §6.4.1 state 7): 44×44 − / + secondary
 * buttons around a tabular-nums count, hard-stopped at the schema bounds.
 * A stepper beats a number input on phones: no keyboard, no invalid states.
 */
export function UnitsStepper({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button
        variant="secondary"
        size="icon"
        aria-label="Fewer units"
        disabled={disabled || value <= MIN_UNITS}
        onClick={() => onChange(Math.max(MIN_UNITS, value - 1))}
      >
        <MinusIcon className="size-4" />
      </Button>
      <span
        aria-live="polite"
        className="w-8 text-center text-base font-semibold tabular-nums"
      >
        {value}
      </span>
      <Button
        variant="secondary"
        size="icon"
        aria-label="More units"
        disabled={disabled || value >= MAX_UNITS}
        onClick={() => onChange(Math.min(MAX_UNITS, value + 1))}
      >
        <PlusIcon className="size-4" />
      </Button>
    </div>
  );
}
