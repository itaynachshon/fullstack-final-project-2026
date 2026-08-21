/**
 * Derives "what needs restocking" for reminder content. Pure, platform
 * neutral.
 *
 * The rules deliberately mirror the MVP /restock page derivations
 * (src/lib/fridge/derive.ts) so a reminder never contradicts what the user
 * sees when they open the app:
 * - Running low: live unit (not finished) at ≤ 25% remaining.
 * - Recently finished: a product whose latest unit finished within the last
 *   14 days and that has NO live unit (restocking removes the row).
 */

export const LOW_STOCK_THRESHOLD = 25;
export const RECENTLY_FINISHED_DAYS = 14;

export interface RestockSourceItem {
  productId: string;
  productName: string | null;
  remainingPercent: number;
  /** ISO timestamp or null while the unit is live. */
  finishedAt: string | null;
}

export interface RestockDigest {
  /** Unique product names running low, lowest level first. */
  lowNames: string[];
  /** Unique recently-finished product names, newest first. */
  finishedNames: string[];
}

export function isRestockDigestEmpty(digest: RestockDigest): boolean {
  return digest.lowNames.length === 0 && digest.finishedNames.length === 0;
}

export function deriveRestockDigest(
  items: readonly RestockSourceItem[],
  nowMs: number,
): RestockDigest {
  const cutoffMs = nowMs - RECENTLY_FINISHED_DAYS * 24 * 60 * 60 * 1000;

  const liveProductIds = new Set<string>();
  for (const item of items) {
    if (item.finishedAt === null) liveProductIds.add(item.productId);
  }

  // Low: one entry per product, remembering its lowest live level for sort.
  const lowByProduct = new Map<string, { name: string; level: number }>();
  // Finished: one entry per product, remembering its latest finish for sort.
  const finishedByProduct = new Map<string, { name: string; atMs: number }>();

  for (const item of items) {
    if (!item.productName) continue;

    if (
      item.finishedAt === null &&
      item.remainingPercent <= LOW_STOCK_THRESHOLD
    ) {
      const current = lowByProduct.get(item.productId);
      if (!current || item.remainingPercent < current.level) {
        lowByProduct.set(item.productId, {
          name: item.productName,
          level: item.remainingPercent,
        });
      }
      continue;
    }

    if (
      item.finishedAt !== null &&
      item.remainingPercent === 0 &&
      !liveProductIds.has(item.productId)
    ) {
      const finishedAtMs = Date.parse(item.finishedAt);
      if (Number.isNaN(finishedAtMs) || finishedAtMs < cutoffMs) continue;
      const current = finishedByProduct.get(item.productId);
      if (!current || finishedAtMs > current.atMs) {
        finishedByProduct.set(item.productId, {
          name: item.productName,
          atMs: finishedAtMs,
        });
      }
    }
  }

  const lowNames = [...lowByProduct.values()]
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    .map((entry) => entry.name);

  const finishedNames = [...finishedByProduct.values()]
    .sort((a, b) => b.atMs - a.atMs || a.name.localeCompare(b.name))
    .map((entry) => entry.name);

  return { lowNames, finishedNames };
}

/** Caps a name list for message bodies: "Milk, Eggs, Cottage and 4 more". */
export function summarizeNames(names: readonly string[], max: number): string {
  if (names.length === 0) return "";
  if (names.length <= max) return names.join(", ");
  const shown = names.slice(0, max).join(", ");
  const rest = names.length - max;
  return `${shown} and ${rest} more`;
}
