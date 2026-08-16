import { cn } from "@/components/ui/utils";
import type { RemainingLevel } from "@/lib/types";

/**
 * The one level indicator (docs/UI_DESIGN.md §7): 4 discrete segments —
 * deliberately not a continuous bar, which would imply precision the ¼-step
 * model doesn't have. Filled = primary (warning-foreground at the 25% low
 * level), empty = muted. Always paired with a text fraction by its parents;
 * the gauge alone never carries the information (§11).
 */
export function LevelGauge({
  level,
  size = "chip",
  className,
}: {
  level: RemainingLevel;
  /** "chip" = unit chips / restock rows; "row" = consume-sheet rows. */
  size?: "chip" | "row";
  className?: string;
}) {
  const filled = level / 25;

  return (
    <div
      aria-hidden="true"
      className={cn("flex", size === "chip" ? "gap-0.5" : "gap-1", className)}
    >
      {[0, 1, 2, 3].map((segment) => (
        <span
          key={segment}
          className={cn(
            "rounded-full",
            size === "chip" ? "h-[5px] w-2.5" : "h-1.5 w-3",
            segment < filled
              ? level === 25
                ? "bg-warning-foreground"
                : "bg-primary"
              : "bg-muted",
          )}
        />
      ))}
    </div>
  );
}
