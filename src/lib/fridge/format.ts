/**
 * Presentation helpers for the fridge domain — pure functions, no I/O.
 *
 * These are domain-level because the five-level consumption model owns its
 * vocabulary (Full/¾/½/¼/Finished) — every surface (chips, consume sheet,
 * restock rows, activity feed, toasts) must speak the same language.
 */

import type { Product, RemainingLevel } from "@/lib/types";

/** Display label per remaining level (UI_DESIGN §6.3 / §8). */
export const LEVEL_LABELS: Record<RemainingLevel, string> = {
  100: "Full",
  75: "¾",
  50: "½",
  25: "¼",
  0: "Finished",
};

export function levelLabel(level: RemainingLevel): string {
  return LEVEL_LABELS[level];
}

/** Spoken-language phrase per level, used in accessible labels. */
export const LEVEL_PHRASES: Record<RemainingLevel, string> = {
  100: "full",
  75: "three quarters remaining",
  50: "half remaining",
  25: "a quarter remaining",
  0: "finished",
};

/** Full-sentence chip label, e.g. "Unit 2 — half remaining. Change level." */
export function unitChipAriaLabel(
  unitNumber: number,
  level: RemainingLevel,
): string {
  return `Unit ${unitNumber} — ${LEVEL_PHRASES[level]}. Change level.`;
}

/**
 * The card meta line: "brand · size", either alone, or the category name when
 * both are missing — the slot never collapses to zero height (UI_DESIGN §7).
 * The " · " separator is a direction-neutral middle dot.
 */
export function productMeta(
  product: Pick<Product, "brand" | "packageSize" | "category">,
): string {
  if (product.brand && product.packageSize) {
    return `${product.brand} · ${product.packageSize}`;
  }
  return product.brand ?? product.packageSize ?? product.category;
}

/**
 * Compact relative time for meta lines: "just now", "5m ago", "3h ago",
 * "2d ago", then a short date ("Aug 3") past two weeks. Deterministic
 * (fixed en-US formatting) so server-rendered output is stable.
 */
export function relativeTime(iso: string, now: Date): string {
  const elapsedMs = now.getTime() - Date.parse(iso);
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return shortDate(new Date(iso));
}

/** "Aug 3" — used for old timestamps and the consume sheet's added-date. */
export function shortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * The fridge inventory summary sentence: "12 items · 3 low · 2 finished".
 * Zero-count low/finished segments are omitted (absence over noise, §7).
 */
export function summaryLine(counts: {
  items: number;
  low: number;
  finished: number;
}): string {
  const parts = [`${counts.items} ${counts.items === 1 ? "item" : "items"}`];
  if (counts.low > 0) parts.push(`${counts.low} low`);
  if (counts.finished > 0) parts.push(`${counts.finished} finished`);
  return parts.join(" · ");
}
