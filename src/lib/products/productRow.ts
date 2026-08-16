/**
 * products table row ↔ API Product mapping, shared by the lookup and search
 * services. One place owns the snake_case → camelCase translation and the
 * column list, so every service returns byte-identical Product shapes.
 */

import type { Category, Product, ProductSource } from "@/lib/types";

/** Exactly the columns the frozen Product type needs — never `select('*')`. */
export const PRODUCT_COLUMNS =
  "id, barcode, name, brand, package_size, category, image_url, source";

/** Raw row shape returned by PRODUCT_COLUMNS (no generated DB types in repo). */
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

/**
 * The casts are safe by construction: the database CHECK constraints
 * (products_category_valid, products_source_valid) admit exactly the frozen
 * Category and ProductSource unions.
 */
export function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    packageSize: row.package_size,
    category: row.category as Category,
    imageUrl: row.image_url,
    source: row.source as ProductSource,
  };
}
