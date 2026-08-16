"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/components/ui/utils";
import type { Category } from "@/lib/types";

import { CategoryIcon } from "./CategoryIcon";
import { renderableImageSrc } from "./image-src";

/**
 * The one product-image treatment (docs/UI_DESIGN.md §7, rule 9): fixed 1:1,
 * `rounded-lg`, white bg, hairline border, `object-contain` — never cover
 * (OFF packshots are on white; cover-cropping decapitates bottles). Missing
 * image and runtime load errors both fall back to the category icon centered
 * on `bg-muted` — deterministic and calm, never a broken-image glyph.
 *
 * The src is gated through renderableImageSrc (allow-listed host only) so a
 * hostile/broken URL stored in the shared catalog degrades to the icon
 * fallback instead of crashing the page — next/image throws for hosts not in
 * next.config.ts remotePatterns (see image-src.ts for the full rationale).
 */
export function ProductImage({
  imageUrl,
  name,
  category,
  size,
  className,
}: {
  imageUrl: string | null;
  name: string;
  category: Category;
  /** Rendered box size in px (48 / 56 / 64 per variant). */
  size: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : renderableImageSrc(imageUrl);

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-lg border",
        src !== null ? "bg-white" : "flex items-center justify-center bg-muted",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src !== null ? (
        <Image
          src={src}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          className="size-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <CategoryIcon
          category={category}
          className={cn(
            "text-muted-foreground",
            size >= 64 ? "size-6" : "size-5",
          )}
        />
      )}
    </div>
  );
}
