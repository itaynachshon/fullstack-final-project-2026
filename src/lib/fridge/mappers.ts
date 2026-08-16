/**
 * Database-row → domain mapping for the fridge feature. Pure functions.
 *
 * The Supabase client is untyped (no generated DB types in Wave 1), so the
 * PostgREST row shapes are declared here once and mapped into the frozen
 * domain types from src/lib/types.ts. Mapping is defensive but silent — the
 * database constraints (CHECKs, FKs) are the real guarantee.
 */

import { CATEGORIES, PRODUCT_SOURCES, REMAINING_LEVELS } from "@/lib/types";
import type {
  Category,
  Product,
  ProductSource,
  RemainingLevel,
} from "@/lib/types";

import type { ActivityEvent, FridgeUnit } from "./derive";

/* ─── Row shapes (snake_case, as returned by PostgREST) ───────────────────── */

export interface ProductRow {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  package_size: string | null;
  category: string;
  image_url: string | null;
  source: string;
}

export interface FridgeItemRow {
  id: string;
  user_id: string;
  product_id: string;
  remaining_percent: number;
  added_at: string;
  finished_at: string | null;
  updated_at: string;
  /** PostgREST many-to-one embeds are objects; arrays are tolerated. */
  product: ProductRow | ProductRow[] | null;
}

export interface ConsumptionEventRow {
  id: string;
  delta_percent: number;
  remaining_after: number;
  created_at: string;
  fridge_item:
    | { product: { name: string } | { name: string }[] | null }
    | { product: { name: string } | { name: string }[] | null }[]
    | null;
}

/* ─── Mapping ─────────────────────────────────────────────────────────────── */

function first<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toCategory(value: string): Category {
  return (CATEGORIES as readonly string[]).includes(value)
    ? (value as Category)
    : "Other";
}

function toSource(value: string): ProductSource {
  return (PRODUCT_SOURCES as readonly string[]).includes(value)
    ? (value as ProductSource)
    : "user";
}

function toRemainingLevel(value: number): RemainingLevel {
  return (REMAINING_LEVELS as readonly number[]).includes(value)
    ? (value as RemainingLevel)
    : 0;
}

export function mapProductRow(row: ProductRow): Product {
  return {
    id: row.id,
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    packageSize: row.package_size,
    category: toCategory(row.category),
    imageUrl: row.image_url,
    source: toSource(row.source),
  };
}

/** Returns null when the product embed is missing (cannot happen via the FK). */
export function mapFridgeItemRow(row: FridgeItemRow): FridgeUnit | null {
  const productRow = first(row.product);
  if (!productRow) return null;
  return {
    id: row.id,
    userId: row.user_id,
    productId: row.product_id,
    remainingPercent: toRemainingLevel(row.remaining_percent),
    addedAt: row.added_at,
    finishedAt: row.finished_at,
    updatedAt: row.updated_at,
    product: mapProductRow(productRow),
  };
}

/** Returns null when the joined product name is missing. */
export function mapEventRow(row: ConsumptionEventRow): ActivityEvent | null {
  const item = first(row.fridge_item);
  const product = first(item?.product);
  if (!product?.name) return null;
  return {
    id: row.id,
    deltaPercent: row.delta_percent,
    remainingAfter: toRemainingLevel(row.remaining_after),
    createdAt: row.created_at,
    productName: product.name,
  };
}
