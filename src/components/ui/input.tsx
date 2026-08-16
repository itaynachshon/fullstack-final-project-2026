/**
 * Input primitive. Always 16px text (`text-base`) — iOS Safari auto-zooms
 * on focused inputs below 16px, which must never happen (UI_DESIGN §3.1).
 */

import type { ComponentProps } from "react";

import { cn } from "./utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-md border border-input bg-card px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
