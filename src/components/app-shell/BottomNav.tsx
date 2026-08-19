"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  MessageCircleIcon,
  PlusIcon,
  RefrigeratorIcon,
  ShoppingBasketIcon,
} from "@/components/icons";
import { cn } from "@/components/ui/utils";
import { ROUTES } from "@/lib/routes";
import { V2_ROUTES } from "@/lib/v2/routes";

/**
 * Mobile bottom navigation (docs/UI_DESIGN.md §5.2): equal destinations,
 * elevation 0 (border-t, no shadow), 64px + safe-area. V2 adds Chat (F3/F4)
 * as a fourth slot — still within the HIG/Material 3–5 destination budget —
 * in the same order as the desktop top bar (Fridge · Add · Restock · Chat).
 * The Add slot keeps its permanently primary-filled 48px circle — the app's
 * visual anchor — while structurally staying an ordinary tab. Hidden from md
 * up, where the top bar takes over (§5.4).
 */
export function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="mx-auto grid h-16 w-full max-w-md grid-cols-4">
        <NavSlot
          href={ROUTES.fridge}
          label="Fridge"
          active={isActive(ROUTES.fridge)}
        >
          <RefrigeratorIcon className="size-6" />
        </NavSlot>

        {/* Add emphasis: filled circle inside the bar — no notch. */}
        <Link
          href={ROUTES.add}
          aria-current={isActive(ROUTES.add) ? "page" : undefined}
          className={cn(
            "flex flex-col items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 motion-safe:transition-transform motion-safe:duration-150",
            isActive(ROUTES.add) ? "text-primary" : "text-muted-foreground",
          )}
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <PlusIcon className="size-6" />
          </span>
          <span className="-mt-1 text-xs font-medium">Add</span>
        </Link>

        <NavSlot
          href={ROUTES.restock}
          label="Restock"
          active={isActive(ROUTES.restock)}
        >
          <ShoppingBasketIcon className="size-6" />
        </NavSlot>

        <NavSlot
          href={V2_ROUTES.chat}
          label="Chat"
          active={isActive(V2_ROUTES.chat)}
        >
          <MessageCircleIcon className="size-6" />
        </NavSlot>
      </div>
    </nav>
  );
}

function NavSlot({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center justify-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 motion-safe:transition-transform motion-safe:duration-150",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      {children}
      <span className="text-xs font-medium">{label}</span>
    </Link>
  );
}
