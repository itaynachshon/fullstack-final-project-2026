/**
 * Zod schemas for every validated boundary — FROZEN CONTRACT (end of Wave 1).
 *
 * One schema source shared by route handlers, server actions, client forms,
 * and tests (docs/TECHNICAL_DESIGN.md §12). Client-side use of these schemas
 * is UX; server-side re-parsing is the security boundary.
 *
 * Wave 2 agents import from here and must NOT modify this file independently.
 */

import { z } from "zod";

import { CATEGORIES, REMAINING_LEVELS } from "@/lib/types";

/* ─── Route-handler query boundaries ──────────────────────────────────────── */

/**
 * GET /api/products/lookup?barcode=…
 * Shape-level bounds only: full GTIN normalization/validation/classification
 * happens in the barcode domain module (src/lib/barcode/, Wave 2).
 */
export const lookupQuerySchema = z.object({
  barcode: z.string().trim().min(1).max(20),
});

/** GET /api/products/search?q=…&page=… (page size is fixed at 20). */
export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(60),
  page: z.coerce.number().int().min(1).default(1),
});

/* ─── Server-action input boundaries ──────────────────────────────────────── */

export const addToFridgeSchema = z.object({
  productId: z.uuid(),
  units: z.number().int().min(1).max(20),
});

export const setRemainingSchema = z.object({
  itemId: z.uuid(),
  remainingPercent: z.literal(REMAINING_LEVELS),
});

export const deleteItemSchema = z.object({
  itemId: z.uuid(),
});

export const restockItemSchema = z.object({
  itemId: z.uuid(),
});

/**
 * Optional fields must be omitted (or `undefined`) when empty — form code maps
 * empty strings to `undefined` before parsing. The optional barcode is bounded
 * here at shape level; it must additionally classify as a GTIN inside the
 * action (barcode domain module, Wave 2).
 */
export const createManualProductSchema = z.object({
  name: z.string().trim().min(1).max(80),
  barcode: z.string().trim().min(1).max(20).optional(),
  brand: z.string().trim().min(1).max(60).optional(),
  packageSize: z.string().trim().min(1).max(30).optional(),
  category: z.enum(CATEGORIES),
  addUnits: z.number().int().min(1).max(20).optional(),
});

/* ─── Shared helper ───────────────────────────────────────────────────────── */

/**
 * Convert a ZodError into the `fieldErrors` map of the ActionError contract
 * (key = dotted input path, value = messages). Issues without a path are
 * grouped under "form".
 */
export function fieldErrorsOf<T>(
  error: z.ZodError<T>,
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key =
      issue.path.length > 0 ? issue.path.map(String).join(".") : "form";
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
  }
  return fieldErrors;
}
