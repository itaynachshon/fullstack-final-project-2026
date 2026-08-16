import type { ComponentProps } from "react";

import { cn } from "./utils";

export type BadgeVariant = "warning" | "muted" | "secondary";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  warning: "bg-warning text-warning-foreground",
  muted: "bg-muted text-muted-foreground",
  secondary: "bg-secondary text-secondary-foreground",
};

export interface BadgeProps extends ComponentProps<"span"> {
  variant?: BadgeVariant;
}

export function Badge({ variant = "muted", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}
