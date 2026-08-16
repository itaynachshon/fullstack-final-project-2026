import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOutIconButton } from "@/components/app-shell/SignOutIconButton";
import {
  CircleCheckIcon,
  RefrigeratorIcon,
} from "@/components/icons";
import { EmptyState } from "@/components/fridge/EmptyState";
import { FridgeFilters } from "@/components/fridge/FridgeFilters";
import { FridgeProductCard } from "@/components/fridge/FridgeProductCard";
import { buttonClasses } from "@/components/ui/button";
import {
  filterUnits,
  groupInventory,
  parseFridgeFilter,
  summarizeUnits,
} from "@/lib/fridge/derive";
import { summaryLine } from "@/lib/fridge/format";
import { fetchFridgeUnits } from "@/lib/fridge/queries";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Fridge",
};

/**
 * The centerpiece (docs/UI_DESIGN.md §6.3): server-fetched inventory grouped
 * by category → product → physical unit chips. Filter state lives in the URL.
 * Auth is checked here again after the proxy (defense in depth); RLS scopes
 * the query itself.
 */
export default async function FridgePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(ROUTES.login);

  const { filter: rawFilter } = await searchParams;
  const filter = parseFridgeFilter(rawFilter);

  const units = await fetchFridgeUnits();
  const summary = summarizeUnits(units);
  const sections = groupInventory(filterUnits(units, filter));

  return (
    <div className="mx-auto w-full max-w-4xl xl:max-w-6xl">
      <header className="flex items-start justify-between pt-4 pb-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fridge</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {summaryLine(summary)}
          </p>
        </div>
        {/* Mobile has no top bar, so sign-out lives here (§6.3); the ≥768px
            top bar carries its own. */}
        <div className="md:hidden">
          <SignOutIconButton />
        </div>
      </header>

      {units.length === 0 ? (
        <EmptyState
          icon={RefrigeratorIcon}
          title="Your fridge is empty"
          body="Scan a barcode — or search the catalog — and it'll show up here."
          action={
            <Link href={ROUTES.add} className={buttonClasses("primary", "lg")}>
              Add your first product
            </Link>
          }
        />
      ) : (
        <>
          <div className="mt-2">
            <FridgeFilters current={filter} summary={summary} />
          </div>

          {sections.length === 0 ? (
            <EmptyState
              icon={CircleCheckIcon}
              title={
                filter === "low" ? "Nothing's running low" : "Nothing finished lately"
              }
              body={
                filter === "low"
                  ? "Items drop in here when they hit a quarter left."
                  : "When a unit hits Finished, it lands here."
              }
            />
          ) : (
            <div className="mt-6 space-y-8">
              {sections.map((section) => (
                <section key={section.category}>
                  <h2 className="mb-3 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                    {section.category} · {section.unitCount}
                  </h2>
                  <div className="grid gap-2 md:grid-cols-2 md:gap-3 xl:grid-cols-3">
                    {section.groups.map((group) => (
                      <FridgeProductCard
                        key={group.product.id}
                        product={group.product}
                        units={group.units.map(({ unit, unitNumber }) => ({
                          id: unit.id,
                          unitNumber,
                          remainingPercent: unit.remainingPercent,
                          addedAt: unit.addedAt,
                          finishedAt: unit.finishedAt,
                        }))}
                        showRestock={filter === "finished"}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
