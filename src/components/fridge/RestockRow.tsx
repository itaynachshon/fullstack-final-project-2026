"use client";

import { useState } from "react";

import type { Product, RemainingLevel } from "@/lib/types";

import { LevelGauge } from "./LevelGauge";
import { ProductCard } from "./ProductCard";
import { RestockButton } from "./RestockButton";

/**
 * One restock row (docs/UI_DESIGN.md §6.5). Low rows stay after restocking —
 * the low unit still exists until consumed (visually honest). Finished rows
 * fade + height-collapse 250ms after the button's "Added" hold, because
 * restocked products leave the finished-recently query.
 */
export function RestockRow({
  itemId,
  product,
  meta,
  level,
  variant,
}: {
  itemId: string;
  product: Product;
  /** Server-computed state line: "¼ left · Dairy" / "Finished · 2d ago". */
  meta: string;
  level: RemainingLevel;
  variant: "low" | "finished";
}) {
  const [collapsing, setCollapsing] = useState(false);
  const [gone, setGone] = useState(false);

  if (gone) return null;

  return (
    <li
      className={
        collapsing
          ? "max-h-0 overflow-hidden opacity-0 transition-all duration-250 motion-reduce:transition-none"
          : "max-h-40 transition-all duration-250 motion-reduce:transition-none"
      }
      onTransitionEnd={() => {
        if (collapsing) setGone(true);
      }}
    >
      <ProductCard
        variant="restock"
        product={product}
        meta={meta}
        muted={variant === "finished"}
        gauge={<LevelGauge level={level} size="chip" className="shrink-0" />}
        trailing={
          <RestockButton
            itemId={itemId}
            productName={product.name}
            onRestocked={
              variant === "finished" ? () => setCollapsing(true) : undefined
            }
          />
        }
      />
    </li>
  );
}
