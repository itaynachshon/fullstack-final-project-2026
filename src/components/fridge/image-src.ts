/**
 * Render-time guard for catalog image URLs (Wave 4 security-audit fix).
 *
 * Why this exists: `products.image_url` is constrained by the application's
 * write paths (the Open Food Facts client stores only https URLs on OFF's
 * image host; manual and seeded products store NULL), but NOT by the
 * database — the RLS insert/update policies check ownership and provenance,
 * not column contents. A user talking to PostgREST directly with their own
 * JWT can therefore store an arbitrary string in a shared catalog row.
 *
 * `next/image` throws at render time for any host that is not allow-listed
 * in next.config.ts `images.remotePatterns`, so an arbitrary URL in shared
 * data would crash the page (error boundary) for every user who sees that
 * product. This guard re-applies the same allow-list at the single point
 * where catalog images are rendered: anything else degrades to the normal
 * "no image" category-icon fallback instead of an error.
 */

/** Must stay in sync with images.remotePatterns in next.config.ts. */
const ALLOWED_IMAGE_HOSTS: readonly string[] = ["images.openfoodfacts.org"];

/** The URL if it is https on an allow-listed host; null (= no image) otherwise. */
export function renderableImageSrc(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return null;
  }
  return parsed.protocol === "https:" && ALLOWED_IMAGE_HOSTS.includes(parsed.hostname)
    ? imageUrl
    : null;
}
