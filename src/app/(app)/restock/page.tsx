import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/fridge/EmptyState";
import { RestockRow } from "@/components/fridge/RestockRow";
import {
  ArrowDownRightIcon,
  CircleCheckIcon,
  HistoryIcon,
  RotateCcwIcon,
  ShoppingBasketIcon,
  TriangleAlertIcon,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import {
  deriveActivity,
  deriveFinishedRecently,
  deriveRunningLow,
} from "@/lib/fridge/derive";
import { levelLabel, relativeTime } from "@/lib/fridge/format";
import { fetchFridgeUnits, fetchRecentActivity } from "@/lib/fridge/queries";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Restock",
};

/**
 * The pre-shopping checklist (docs/UI_DESIGN.md §6.5): Running low (≤25%
 * live), Recently finished (last 14 days, hidden once restocked), Recent
 * activity (last 10 events, pure history). Urgency reads through position,
 * icons, counts, and fraction text — never color alone.
 */
export default async function RestockPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(ROUTES.login);

  const [units, events] = await Promise.all([
    fetchFridgeUnits(),
    fetchRecentActivity(10),
  ]);

  const now = new Date();
  const low = deriveRunningLow(units);
  const finished = deriveFinishedRecently(units, now);
  const activity = deriveActivity(events, now);

  const buyCount = low.length + finished.length;
  const pageEmpty =
    low.length === 0 && finished.length === 0 && activity.length === 0;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="pt-4 pb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Restock</h1>
        {buyCount > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {buyCount} {buyCount === 1 ? "thing" : "things"} to buy
          </p>
        )}
      </header>

      {pageEmpty ? (
        <EmptyState
          icon={ShoppingBasketIcon}
          title="Nothing to restock"
          body="When something runs low or finishes, it lands here so you know what to buy."
          action={
            <Link
              href={ROUTES.fridge}
              className={buttonClasses("secondary", "lg")}
            >
              Go to your fridge
            </Link>
          }
        />
      ) : (
        <div className="mt-4 space-y-8">
          <section aria-labelledby="restock-low-heading">
            <div className="mb-3 flex items-center gap-2">
              <TriangleAlertIcon
                className="size-5 text-warning-foreground"
                aria-hidden="true"
              />
              <h2 id="restock-low-heading" className="text-base font-semibold">
                Running low
              </h2>
              {low.length > 0 && <Badge variant="warning">{low.length}</Badge>}
            </div>
            {low.length === 0 ? (
              <EmptyState
                className="py-8"
                icon={CircleCheckIcon}
                title="Nothing's running low"
                body="Items drop in here when they hit a quarter left."
              />
            ) : (
              <ul className="space-y-2">
                {low.map((entry) => (
                  <RestockRow
                    key={entry.itemId}
                    itemId={entry.itemId}
                    product={entry.product}
                    level={entry.remainingPercent}
                    variant="low"
                    meta={`${levelLabel(entry.remainingPercent)} left · ${entry.product.category}`}
                  />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="restock-finished-heading">
            <div className="mb-3 flex items-center gap-2">
              <CircleCheckIcon
                className="size-5 text-muted-foreground"
                aria-hidden="true"
              />
              <h2
                id="restock-finished-heading"
                className="text-base font-semibold"
              >
                Recently finished
              </h2>
              {finished.length > 0 && (
                <Badge variant="muted">{finished.length}</Badge>
              )}
            </div>
            {finished.length === 0 ? (
              <EmptyState
                className="py-8"
                icon={CircleCheckIcon}
                title="Nothing finished lately"
                body="When a unit hits Finished, it waits here for 14 days."
              />
            ) : (
              <ul className="space-y-2">
                {finished.map((entry) => (
                  <RestockRow
                    key={entry.itemId}
                    itemId={entry.itemId}
                    product={entry.product}
                    level={entry.remainingPercent}
                    variant="finished"
                    meta={`Finished · ${
                      entry.finishedAt
                        ? relativeTime(entry.finishedAt, now)
                        : "recently"
                    }`}
                  />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="restock-activity-heading">
            <div className="mb-3 flex items-center gap-2">
              <HistoryIcon
                className="size-5 text-muted-foreground"
                aria-hidden="true"
              />
              <h2
                id="restock-activity-heading"
                className="text-base font-semibold"
              >
                Recent activity
              </h2>
            </div>
            {activity.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No activity yet — changes to your items will show up here.
              </p>
            ) : (
              <ul className="space-y-2">
                {activity.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                  >
                    {entry.direction === "consumed" ? (
                      <ArrowDownRightIcon
                        className="size-4 shrink-0"
                        aria-hidden="true"
                      />
                    ) : (
                      <RotateCcwIcon
                        className="size-4 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <span className="min-w-0 truncate">
                      {entry.actionLabel}{" "}
                      <span dir="auto">{entry.productName}</span>
                      {" → "}
                      {entry.levelLabel}
                    </span>
                    <span className="shrink-0">· {entry.relativeLabel}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* ODbL attribution: desktop shows it in the shell footer (§5.4);
          mobile carries it at the bottom of this page. */}
      <p className="pt-8 text-xs text-muted-foreground md:hidden">
        Product data: our catalog + Open Food Facts (ODbL).
      </p>
    </div>
  );
}
