"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { RefrigeratorIcon } from "@/components/icons";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { cn } from "@/components/ui/utils";
import { ROUTES } from "@/lib/routes";
import { V2_ROUTES } from "@/lib/v2/routes";

import { SignOutIconButton } from "./SignOutIconButton";

// Chat is included here by F2 per docs/FEATURES_V2_PLAN.md §5.5 (TopBar is
// F2-owned; F3 adds Chat to BottomNav only). Route is frozen in V2_ROUTES.
const NAV_LINKS = [
  { href: ROUTES.fridge, label: "Fridge" },
  { href: ROUTES.add, label: "Add" },
  { href: ROUTES.restock, label: "Restock" },
  { href: V2_ROUTES.chat, label: "Chat" },
] as const;

/**
 * Top header bar (docs/UI_DESIGN.md §5.4). Originally ≥768px-only; V2's
 * notification bell (F2) needs a home on phones too — BottomNav is F3-owned
 * and full — so the bar now renders at every size: phones get a slim
 * brand + bell strip (nav stays in BottomNav, sign-out stays desktop-only,
 * exactly as in the MVP), while md+ keeps brand + inline nav + bell +
 * sign-out.
 */
export function TopBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-card">
      <div className="mx-auto flex h-12 w-full max-w-5xl items-center gap-3 px-4 md:h-14 md:gap-6 md:px-6">
        <Link
          href={ROUTES.fridge}
          className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <RefrigeratorIcon className="size-4" />
          </span>
          <span className="text-base font-semibold">Fridge Tracker</span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
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

        <div className="ml-auto flex items-center gap-1">
          <NotificationBell />
          <div className="hidden md:block">
            <SignOutIconButton />
          </div>
        </div>
      </div>
    </header>
  );
}
