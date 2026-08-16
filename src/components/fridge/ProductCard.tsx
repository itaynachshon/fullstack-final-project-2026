import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/utils";
import { productMeta } from "@/lib/fridge/format";
import type { Product } from "@/lib/types";

import { ProductImage } from "./ProductImage";

/**
 * The one product-row component (docs/UI_DESIGN.md §7) — four variants, one
 * visual language; no page may hand-roll a product row.
 *
 *  - fridge:        56px image · name (2-line clamp) · meta · Low badge slot ·
 *                   unit-chip row (passed as children)
 *  - search-result: 48px image · name (1-line) · meta · trailing Plus
 *                   affordance; the WHOLE row is the ≥56px tap target
 *  - confirm:       64px image · name (no clamp) · meta · category badge;
 *                   chrome-less — lives inside the product-confirm sheet
 *  - restock:       48px image · name (1-line) · state meta + mini-gauge ·
 *                   trailing Restock button
 *
 * Every catalog-text element carries dir="auto" (Hebrew names must render
 * correctly on first paint); the " · " separator is direction-neutral.
 */

export type ProductCardVariant =
  "fridge" | "search-result" | "confirm" | "restock";

type CardProduct = Pick<
  Product,
  "name" | "brand" | "packageSize" | "category" | "imageUrl"
>;

/** Name clamping per variant (§7): dense rows 1 line, fridge 2, confirm none. */
const NAME_CLAMP: Record<ProductCardVariant, string> = {
  fridge: "line-clamp-2",
  "search-result": "line-clamp-1",
  confirm: "",
  restock: "line-clamp-1",
};

export interface ProductCardProps {
  product: CardProduct;
  variant: ProductCardVariant;
  /** Overrides the default "brand · size" meta (restock state lines). */
  meta?: string;
  /** Rendered next to the meta line, never truncates (fridge Low badge). */
  badge?: React.ReactNode;
  /** Mini-gauge slot rendered beside the meta line (restock rows). */
  gauge?: React.ReactNode;
  /** Trailing slot: Plus affordance (search) / Restock button (restock). */
  trailing?: React.ReactNode;
  /** Muted treatment for finished rows. */
  muted?: boolean;
  /** search-result only: makes the whole row an accessible button. */
  onSelect?: () => void;
  /** fridge only: the unit-chip row. */
  children?: React.ReactNode;
  className?: string;
}

const IMAGE_SIZE: Record<ProductCardVariant, number> = {
  fridge: 56,
  "search-result": 48,
  confirm: 64,
  restock: 48,
};

export function ProductCard({
  product,
  variant,
  meta,
  badge,
  gauge,
  trailing,
  muted = false,
  onSelect,
  children,
  className,
}: ProductCardProps) {
  const metaLine = meta ?? productMeta(product);

  const image = (
    <ProductImage
      imageUrl={product.imageUrl}
      name={product.name}
      category={product.category}
      size={IMAGE_SIZE[variant]}
      className={muted ? "opacity-60" : undefined}
    />
  );

  const name = (
    <p
      dir="auto"
      className={cn(
        "text-base leading-snug font-medium",
        NAME_CLAMP[variant],
        muted ? "text-muted-foreground" : "text-foreground",
      )}
    >
      {product.name}
    </p>
  );

  const metaRow = (
    <div className="mt-0.5 flex min-w-0 items-center gap-2">
      {gauge}
      <p dir="auto" className="min-w-0 truncate text-xs text-muted-foreground">
        {metaLine}
      </p>
      {badge}
    </div>
  );

  if (variant === "confirm") {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        {image}
        <div className="min-w-0 flex-1">
          {name}
          {metaRow}
          <Badge variant="secondary" className="mt-1.5">
            {product.category}
          </Badge>
        </div>
      </div>
    );
  }

  if (variant === "search-result") {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 rounded-xl border bg-card p-3 text-start transition-colors duration-150 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
          className,
        )}
      >
        {image}
        <div className="min-w-0 flex-1">
          {name}
          {metaRow}
        </div>
        {trailing}
      </button>
    );
  }

  if (variant === "restock") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border bg-card p-3",
          className,
        )}
      >
        {image}
        <div className="min-w-0 flex-1">
          {name}
          {metaRow}
        </div>
        {trailing}
      </div>
    );
  }

  // fridge
  return (
    <article className={cn("rounded-xl border bg-card p-3", className)}>
      <div className="flex gap-3">
        {image}
        <div className="min-w-0 flex-1">
          {name}
          {metaRow}
          {children ? (
            <div className="mt-2 flex flex-wrap gap-2">{children}</div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
