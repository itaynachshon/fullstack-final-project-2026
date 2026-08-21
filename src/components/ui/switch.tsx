"use client";

/**
 * Switch primitive — native <button role="switch">, no Radix (dependency set
 * is frozen). Follows the design system: semantic tokens, visible focus ring,
 * 150ms motion that respects prefers-reduced-motion. The visual track is
 * 28×48px; an invisible ::after pad extends the hit area toward the 44px
 * minimum target (UI_DESIGN §3.1).
 */

import { cn } from "./utils";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Accessible name — required, the control renders no text of its own. */
  ariaLabel: string;
  className?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  ariaLabel,
  className,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full outline-none after:absolute after:-inset-2 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 motion-safe:transition-colors motion-safe:duration-150",
        checked ? "bg-primary" : "bg-muted",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none block size-5 rounded-full bg-card shadow-sm motion-safe:transition-transform motion-safe:duration-150",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}
