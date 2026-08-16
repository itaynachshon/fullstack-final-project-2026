import type { ComponentProps } from "react";

import { cn } from "./utils";

/** Loading placeholder that mirrors final layout (UI_DESIGN §9 doctrine). */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-lg bg-muted motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}
