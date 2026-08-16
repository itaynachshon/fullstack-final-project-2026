import Link from "next/link";

import { cn } from "@/components/ui/utils";
import type { FridgeFilter, FridgeSummary } from "@/lib/fridge/derive";
import { ROUTES } from "@/lib/routes";

/**
 * All / Low / Finished segmented pills (docs/UI_DESIGN.md §6.3). Filter state
 * lives in the URL (?filter=) — links, not client state, per the approved
 * state model. 36px visual pills padded to a ≥44px hit area; counts ride
 * along so the pills double as the low/finished tallies.
 */
export function FridgeFilters({
  current,
  summary,
}: {
  current: FridgeFilter;
  summary: FridgeSummary;
}) {
  const pills: Array<{ filter: FridgeFilter; label: string; count?: number }> =
    [
      { filter: "all", label: "All" },
      { filter: "low", label: "Low", count: summary.low },
      { filter: "finished", label: "Finished", count: summary.finished },
    ];

  return (
    <nav aria-label="Filter fridge items" className="flex flex-wrap gap-x-2">
      {pills.map(({ filter, label, count }) => {
        const selected = current === filter;
        return (
          <Link
            key={filter}
            href={
              filter === "all"
                ? ROUTES.fridge
                : `${ROUTES.fridge}?filter=${filter}`
            }
            replace
            scroll={false}
            aria-current={selected ? "true" : undefined}
            className="flex h-11 items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none",
                selected
                  ? "bg-primary text-primary-foreground"
                  : "border bg-card text-foreground hover:bg-accent",
              )}
            >
              {label}
              {count !== undefined && count > 0 ? (
                <span
                  className={cn(
                    "tabular-nums",
                    selected
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              ) : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
