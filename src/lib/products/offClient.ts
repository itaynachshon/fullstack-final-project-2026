/**
 * Open Food Facts client — server-side only, barcode reads only.
 *
 * OFF is a FALLBACK, not critical infrastructure (docs/TECHNICAL_DESIGN.md
 * §5.2–5.3): it is called once per catalog miss, its search/facet APIs are
 * never used (measured unreliable in docs/research/BARCODE_APIS.md §4.2), and
 * every failure mode degrades — callers map failures to a not_found result,
 * never to a user-facing 5xx.
 *
 * Mechanics per the approved plan:
 *   - GET /api/v2/product/{code} with a fields= selection of exactly what the
 *     app maps — no nutrition, no raw-response storage;
 *   - custom User-Agent identifying this student application (OFF policy for
 *     API consumers; a constant, not a secret);
 *   - ~3-second timeout via AbortController — covers header AND body time;
 *   - no API key, no retries (one shot; the manual-entry path is the retry).
 */

import { z } from "zod";

/** Distinguished internally; callers decide how to degrade. */
export type OffFailureReason =
  "timeout" | "network" | "upstream" | "invalid_response";

/** What the app actually uses from OFF — nothing else is requested or kept. */
export interface OffProduct {
  name: string;
  brand: string | null;
  packageSize: string | null;
  imageUrl: string | null;
}

export type OffLookupResult =
  | { outcome: "found"; product: OffProduct }
  | { outcome: "not_found" }
  | { outcome: "failure"; reason: OffFailureReason };

export const OFF_TIMEOUT_MS = 3000;

const OFF_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product/";

/** Only the fields the app maps (docs/TECHNICAL_DESIGN.md §5.2). */
const OFF_FIELDS =
  "code,product_name,product_name_he,brands,quantity,image_front_url";

/** OFF API policy requires an identifying User-Agent: AppName/Version (contact). */
const OFF_USER_AGENT =
  "FridgeTracker/0.1 (RUNI CS 2026 university final project; student fridge-inventory app)";

/** Images are hotlinked from OFF's image host only (allow-listed in next.config.ts). */
const OFF_IMAGE_HOST = "images.openfoodfacts.org";

/** Sane display ceiling for crowdsourced names (docs/TECHNICAL_DESIGN.md §5.2). */
const MAX_NAME_LENGTH = 120;

/**
 * Defensive shape for the v2 read response. Unknown keys are ignored; a
 * response that does not even fit this envelope is classified
 * "invalid_response" and degraded by the caller.
 */
const offResponseSchema = z.object({
  status: z.union([z.number(), z.string()]).optional(),
  product: z
    .object({
      product_name: z.string().optional(),
      product_name_he: z.string().optional(),
      brands: z.string().optional(),
      quantity: z.string().optional(),
      image_front_url: z.string().optional(),
    })
    .optional(),
});

/**
 * Node's fetch rejects aborts with a DOMException, which is NOT `instanceof
 * Error` in Node — so detection is structural (by `name`), not by class.
 */
function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return name === "AbortError" || name === "TimeoutError";
}

function cleanText(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/** First brand of OFF's comma-separated `brands` list. */
function firstBrand(brands: string | undefined): string | null {
  return cleanText(brands?.split(",")[0]);
}

/** Accept only https URLs on OFF's own image host; anything else is dropped. */
function safeImageUrl(url: string | undefined): string | null {
  const candidate = cleanText(url);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" && parsed.hostname === OFF_IMAGE_HOST
      ? candidate
      : null;
  } catch {
    return null;
  }
}

/**
 * Read one product from Open Food Facts by canonical barcode.
 *
 * Never throws: every outcome — including timeouts, network errors, upstream
 * 5xx and unusable payloads — is returned as a value so the lookup chain can
 * degrade deliberately.
 */
export async function fetchOffProduct(
  canonicalBarcode: string,
): Promise<OffLookupResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);

  try {
    let response: Response;
    try {
      response = await fetch(
        `${OFF_PRODUCT_URL}${encodeURIComponent(canonicalBarcode)}?fields=${OFF_FIELDS}`,
        {
          headers: { "User-Agent": OFF_USER_AGENT, Accept: "application/json" },
          signal: controller.signal,
          // Every scan that reaches OFF must be a live read; our own products
          // table is the only cache in the system.
          cache: "no-store",
        },
      );
    } catch (error) {
      return {
        outcome: "failure",
        reason: isAbortError(error) ? "timeout" : "network",
      };
    }

    // OFF answers a definitive miss with HTTP 404 (+ status: 0).
    if (response.status === 404) return { outcome: "not_found" };
    if (!response.ok) return { outcome: "failure", reason: "upstream" };

    let payload: unknown;
    try {
      // Reading the body is still under the same AbortController deadline.
      payload = await response.json();
    } catch (error) {
      return {
        outcome: "failure",
        reason: isAbortError(error) ? "timeout" : "invalid_response",
      };
    }

    const parsed = offResponseSchema.safeParse(payload);
    if (!parsed.success)
      return { outcome: "failure", reason: "invalid_response" };

    // Some edge responses report a miss with 200 + status 0.
    if (Number(parsed.data.status) !== 1 || !parsed.data.product) {
      return { outcome: "not_found" };
    }

    const raw = parsed.data.product;
    // Hebrew name preferred — this is an Israeli-household app.
    const name = cleanText(raw.product_name_he) ?? cleanText(raw.product_name);
    if (!name) {
      // A record we cannot even name is unusable for the catalog.
      return { outcome: "failure", reason: "invalid_response" };
    }

    return {
      outcome: "found",
      product: {
        name: name.slice(0, MAX_NAME_LENGTH),
        brand: firstBrand(raw.brands),
        packageSize: cleanText(raw.quantity),
        imageUrl: safeImageUrl(raw.image_front_url),
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}
