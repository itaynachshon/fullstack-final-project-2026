/**
 * Button primitive — hand-vendored (shadcn-style API without the Radix
 * dependency, which is not part of the approved Wave 1 dependency set).
 * Variants and sizes follow docs/UI_DESIGN.md: 44px minimum targets, semantic
 * tokens only, visible focus ring, 150ms color transitions.
 */

import type { ComponentProps } from "react";

import { cn } from "./utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "default" | "lg" | "icon";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  default: "h-11 px-4",
  lg: "h-12 px-6",
  icon: "size-11",
};

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** Class recipe shared by <Button> and link-styled-as-button call sites. */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "default",
  className?: string,
): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 motion-reduce:transition-none",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "default",
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      {...props}
    />
  );
}
