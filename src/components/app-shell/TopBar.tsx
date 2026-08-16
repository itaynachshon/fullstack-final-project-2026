"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { RefrigeratorIcon } from "@/components/icons";
import { cn } from "@/components/ui/utils";
import { ROUTES } from "@/lib/routes";

import { SignOutIconButton } from "./SignOutIconButton";

const NAV_LINKS = [
  { href: ROUTES.fridge, label: "Fridge" },
  { href: ROUTES.add, label: "Add" },
  { href: ROUTES.restock, label: "Restock" },
] as const;

/**
 * Top header bar for ≥ 768px (docs/UI_DESIGN.md §5.4) — a bottom bar is a
 * mobile pattern, so larger screens get brand + inline nav + sign-out.
 */
export function TopBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 hidden border-b border-border bg-card md:block">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-6 px-6">
        <Link
          href={ROUTES.fridge}
          className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <RefrigeratorIcon className="size-4" />
          </span>
          <span className="text-base font-semibold">Fridge Tracker</span>
        </Link>

        <nav aria-label="Main" className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150",
                  active
                    ? "bg-accent text-primary"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto">
          <SignOutIconButton />
        </div>
      </div>
    </header>
  );
}
