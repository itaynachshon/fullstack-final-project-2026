/**
 * Shared domain types — FROZEN CONTRACT (end of Wave 1).
 *
 * Every layer (server actions, route handlers, pages, components, tests)
 * imports these definitions. Wave 2 agents build against this file and must
 * NOT modify it independently; any change requires a coordinated commit on
 * main first (see docs/IMPLEMENTATION_PLAN.md §21).
 *
 * The shapes here mirror docs/TECHNICAL_DESIGN.md §6.1 and the database
 * schema in supabase/migrations/.
 */

/* ─── Category taxonomy (fixed, product-owned) ────────────────────────────── */

export const CATEGORIES = [
  "Dairy",
  "Meat & Fish",
  "Vegetables",
  "Fruit",
  "Drinks",
  "Sauces & Spreads",
  "Snacks",
  "Prepared",
  "Frozen",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

/* ─── Consumption model ───────────────────────────────────────────────────── */

/** The five-level fractional consumption model: Full → ¾ → ½ → ¼ → Finished. */
export const REMAINING_LEVELS = [0, 25, 50, 75, 100] as const;

export type RemainingLevel = (typeof REMAINING_LEVELS)[number];

/* ─── Entities ────────────────────────────────────────────────────────────── */

/** Provenance of a catalog row: seeded / cached Open Food Facts hit / manual. */
export const PRODUCT_SOURCES = ["catalog", "off", "user"] as const;

export type ProductSource = (typeof PRODUCT_SOURCES)[number];

/** Shared catalog product — the API-facing shape (docs/TECHNICAL_DESIGN.md §6.1). */
export interface Product {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  packageSize: string | null;
  category: Category;
  imageUrl: string | null;
  source: ProductSource;
}

/** One physical unit in a user's fridge (timestamps are ISO-8601 strings). */
export interface FridgeItem {
  id: string;
  userId: string;
  productId: string;
  remainingPercent: RemainingLevel;
  addedAt: string;
  finishedAt: string | null;
  updatedAt: string;
}

/**
 * Append-only consumption log row. `deltaPercent` is signed as old − new
 * (docs/IMPLEMENTATION_PLAN.md §12): positive = points consumed, negative =
 * upward correction/restoration (e.g. 100 → 75 logs +25; 0 → 50 logs −50).
 */
export interface ConsumptionEvent {
  id: string;
  fridgeItemId: string;
  userId: string;
  deltaPercent: number;
  remainingAfter: RemainingLevel;
  createdAt: string;
}

/* ─── Barcode domain (implemented by src/lib/barcode/ in Wave 2 — Agent A) ── */

/**
 * Result of normalizing + validating + classifying a raw barcode string.
 * `canonical` follows the Open Food Facts storage convention so our cache
 * keys are byte-identical to OFF `code` values (docs/TECHNICAL_DESIGN.md §4).
 */
export type BarcodeClassification =
  | { kind: "gtin"; canonical: string } // valid retail GTIN — safe to look up
  | { kind: "rcn"; canonical: string } // store-internal code — never look up
  | { kind: "invalid"; reason: string }; // not a barcode / bad length / bad check digit

/* ─── HTTP contract: GET /api/products/lookup ─────────────────────────────── */

/** Where a successful lookup was resolved: our catalog or Open Food Facts. */
export type LookupSource = "db" | "off";

/**
 * `invalid` and `rcn` are deliberate 200-level domain outcomes, not HTTP
 * errors — the client UI routes on them (re-scan prompt / manual form).
 * `fallbackUsed` marks an Open Food Facts timeout/failure degraded to
 * not_found (docs/TECHNICAL_DESIGN.md §5.3, §6.2).
 */
export type LookupResponse =
  | { status: "found"; product: Product; source: LookupSource }
  | { status: "not_found"; barcode: string; fallbackUsed?: true }
  | { status: "invalid"; reason: string }
  | { status: "rcn"; reason: string };

/* ─── HTTP contract: GET /api/products/search ─────────────────────────────── */

/** Page size is 20; `hasMore` signals that another page exists. */
export interface SearchResponse {
  items: Product[];
  page: number;
  hasMore: boolean;
}

/* ─── HTTP error shape (route handlers, non-200 statuses) ─────────────────── */

export type ApiErrorCode = "invalid_request" | "unauthenticated" | "internal";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

/* ─── Server-action result contract ───────────────────────────────────────── */

export type ActionErrorCode =
  "unauthenticated" | "validation" | "not_found" | "internal";

export interface ActionError {
  code: ActionErrorCode;
  message: string;
  /** Per-field validation messages for form UIs (key = input field path). */
  fieldErrors?: Record<string, string[]>;
}

/**
 * Discriminated union returned by every server action. Actions never throw
 * across the client boundary — every outcome is a value.
 */
export type ActionResult<T> =
  { ok: true; data: T } | { ok: false; error: ActionError };

/* ─── Server-action inputs and outputs (docs/TECHNICAL_DESIGN.md §6.4) ────── */

export interface AddToFridgeInput {
  productId: string;
  units: number; // integer 1–20
}
export interface AddToFridgeData {
  itemIds: string[];
}

export interface SetRemainingInput {
  itemId: string;
  remainingPercent: RemainingLevel;
}
export interface SetRemainingData {
  itemId: string;
  remainingPercent: RemainingLevel;
  finished: boolean;
}

export interface DeleteItemInput {
  itemId: string;
}
export interface DeleteItemData {
  itemId: string;
}

export interface RestockItemInput {
  itemId: string;
}
export interface RestockItemData {
  newItemId: string;
}

export interface CreateManualProductInput {
  name: string; // 1–80 chars
  barcode?: string; // optional; must classify as GTIN (validated in Wave 2)
  brand?: string; // ≤ 60 chars
  packageSize?: string; // ≤ 30 chars
  category: Category;
  addUnits?: number; // optional integer 1–20 — also add to fridge in one step
}
export interface CreateManualProductData {
  product: Product;
  /** True when the barcode already existed and the existing product was returned. */
  existed: boolean;
  itemIds: string[];
}

/* ─── BarcodeScanner component contract (implemented in Wave 2 — Agent C) ─── */

/**
 * The only interface between the scanner island and the add flow:
 * `<BarcodeScanner onDetected={(raw) => …} />` (docs/TECHNICAL_DESIGN.md §9.2).
 * `raw` is the detected code as read — normalization/classification happens
 * in the barcode domain module, not in the scanner.
 */
export interface BarcodeScannerProps {
  onDetected: (raw: string) => void;
  /** When true, the scanner keeps the camera open but suspends detection. */
  paused?: boolean;
}
