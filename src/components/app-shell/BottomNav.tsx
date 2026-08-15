"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ROUTES } from "@/lib/routes";

const NAV_ITEMS = [
  { href: ROUTES.fridge, label: "Fridge" },
  { href: ROUTES.add, label: "Add" },
  { href: ROUTES.restock, label: "Restock" },
] as const;

/**
 * Thumb-reachable bottom navigation for the authenticated shell
 * (docs/TECHNICAL_DESIGN.md §9.1).
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid w-full max-w-md grid-cols-3">
        {NAV_ITEMS.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "flex h-14 items-center justify-center text-sm font-semibold text-zinc-900"
                  : "flex h-14 items-center justify-center text-sm font-medium text-zinc-400 hover:text-zinc-700"
              }
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
