/**
 * Catalog fetcher — one-time, LOCAL script (IMPLEMENTATION_PLAN.md §6.2 step 1).
 *
 *   node scripts/fetch-catalog.ts [storeId storeId ...]      (default: 1 14)
 *
 * Downloads the latest PriceFull file for 2–3 Shufersal stores from the
 * statutory price-transparency portal (legally free for any use, Israeli Food
 * Law §30(e) — docs/research/ISRAELI_RETAIL_DATA.md §2), then:
 *
 *   parse XML → drop weighted items (bIsWeighted=1, store-scale pseudo-codes)
 *             → drop codes that fail GTIN validation (classifyBarcode)
 *             → dedupe by canonical barcode across stores
 *             → map name keywords → our 10-category taxonomy
 *             → write data/catalog-seed.csv (committed: reproducible seeding
 *               for graders without access to Israeli portals)
 *
 * Portal mechanics observed live in the research (§3.3): the filtered listing
 * `/FileObject/UpdateCategory?catID=2&storeId=N` links to gzipped XML on Azure
 * Blob Storage via short-lived SAS URLs. Run from an Israeli network (some
 * chain portals geo-block; never fetched at request time from Vercel).
 *
 * Dependency-free by design: Node's fetch/zlib + a regex scan of the flat,
 * machine-generated <Item> records (no XML library for a one-shot script).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { classifyBarcode } from "../src/lib/barcode/index.ts";
import { mapCategory } from "../src/lib/products/categorize.ts";
import { encodeCsv, type SeedRow } from "./lib/catalogCsv.ts";

const PORTAL = "https://prices.shufersal.co.il";
/** Store 1 = sub-chain "Sheli" (urban), store 14 = "Deal" (discount) — the two
 * formats probed in the research; their union covers both assortments. */
const DEFAULT_STORE_IDS = [1, 14];
const OUTPUT_PATH = "data/catalog-seed.csv";

const USER_AGENT =
  "FridgeTracker-Seed/0.1 (RUNI CS 2026 university project; one-time catalog seeding)";
const FETCH_TIMEOUT_MS = 30_000;

/** Same display cap as the OFF mapping (docs/TECHNICAL_DESIGN.md §5.2). */
const MAX_NAME_LENGTH = 120;

/** Manufacturer strings that mean "unknown" in practice — stored as NULL. */
const UNKNOWN_BRANDS = new Set(["לא ידוע", "unknown", "כללי"]);

async function fetchOrDie(url: string): Promise<Response> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`GET ${url} → HTTP ${response.status}`);
  }
  return response;
}

/**
 * Find the newest PriceFull blob link on a listing page. Links look like
 *   https://pricesprodpublic.blob.core.windows.net/pricefull/PriceFull
 *   7290027600007-001-001-20260814-030000.gz?sv=…(SAS)…
 * and are HTML-attribute-escaped (&amp;). Newest = max filename timestamp.
 */
function latestPriceFullUrl(listingHtml: string): string | null {
  const matches = listingHtml.match(
    /https:\/\/[^"'\s]+\/PriceFull[^"'\s]+\.gz[^"'\s]*/g,
  );
  if (!matches) return null;

  let best: { url: string; stamp: string } | null = null;
  for (const raw of matches) {
    const url = raw.replaceAll("&amp;", "&");
    const stampMatch = url.match(/-(\d{8})-(\d{6})\.gz/);
    const stamp = stampMatch ? stampMatch[1] + stampMatch[2] : "0";
    if (!best || stamp > best.stamp) best = { url, stamp };
  }
  return best?.url ?? null;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(?:amp|lt|gt|quot|apos|#39);/g,
    (entity) => ENTITIES[entity],
  );
}

/** Text of a flat child element, e.g. tag(block, "ItemCode"). */
function tagText(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return match ? decodeEntities(match[1]).trim() : "";
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function cleanBrand(manufactureName: string): string {
  const brand = collapseWhitespace(manufactureName);
  return UNKNOWN_BRANDS.has(brand.toLowerCase()) ? "" : brand;
}

/**
 * Display-only package string from the regulated quantity fields:
 * Quantity "1.00" + UnitQty "ליטר" → "1 ליטר". "1 יחידה" (one unit) is
 * omitted — it carries no information.
 */
function formatPackageSize(quantity: string, unitQty: string): string {
  const amount = quantity.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  if (!amount || !unitQty || Number(amount) <= 0) return "";
  if (unitQty === "יחידה" && amount === "1") return "";
  return `${amount} ${unitQty}`;
}

interface StoreStats {
  storeId: number;
  total: number;
  weighted: number;
  badCode: number;
  nameless: number;
  kept: number;
}

async function fetchStore(
  storeId: number,
  catalog: Map<string, SeedRow>,
): Promise<StoreStats> {
  const listingUrl = `${PORTAL}/FileObject/UpdateCategory?catID=2&storeId=${storeId}`;
  const listingHtml = await (await fetchOrDie(listingUrl)).text();

  const fileUrl = latestPriceFullUrl(listingHtml);
  if (!fileUrl) {
    throw new Error(
      `no PriceFull link found on ${listingUrl} — portal layout changed?`,
    );
  }
  console.log(`store ${storeId}: downloading ${fileUrl.split("?")[0]}`);

  const gz = Buffer.from(await (await fetchOrDie(fileUrl)).arrayBuffer());
  const xml = gunzipSync(gz).toString("utf8");

  const stats: StoreStats = {
    storeId,
    total: 0,
    weighted: 0,
    badCode: 0,
    nameless: 0,
    kept: 0,
  };

  for (const [, block] of xml.matchAll(
    /<Item(?:\s[^>]*)?>([\s\S]*?)<\/Item>/g,
  )) {
    stats.total++;

    if (tagText(block, "bIsWeighted") === "1") {
      stats.weighted++; // store-scale pseudo-barcode, not a stable identity
      continue;
    }

    const classification = classifyBarcode(tagText(block, "ItemCode"));
    if (classification.kind !== "gtin") {
      stats.badCode++; // internal code / bad check digit / RCN
      continue;
    }

    const name = collapseWhitespace(tagText(block, "ItemName"));
    if (!name) {
      stats.nameless++;
      continue;
    }

    if (!catalog.has(classification.canonical)) {
      const brand = cleanBrand(tagText(block, "ManufactureName"));
      catalog.set(classification.canonical, {
        barcode: classification.canonical,
        name: name.slice(0, MAX_NAME_LENGTH),
        brand,
        package_size: formatPackageSize(
          tagText(block, "Quantity"),
          tagText(block, "UnitQty"),
        ),
        category: mapCategory(name, brand || null),
      });
    }
    stats.kept++;
  }

  return stats;
}

async function main(): Promise<void> {
  const storeIds = process.argv.slice(2).map(Number).filter(Number.isInteger);
  const stores = storeIds.length > 0 ? storeIds : DEFAULT_STORE_IDS;

  console.log(
    `Fetching Shufersal PriceFull catalogs for stores: ${stores.join(", ")}`,
  );
  const catalog = new Map<string, SeedRow>();

  for (const storeId of stores) {
    const stats = await fetchStore(storeId, catalog);
    console.log(
      `store ${stats.storeId}: ${stats.total} items — kept ${stats.kept}, ` +
        `filtered ${stats.weighted} weighted + ${stats.badCode} non-GTIN codes` +
        (stats.nameless > 0 ? ` + ${stats.nameless} nameless` : ""),
    );
  }

  // Stable order → reviewable diffs when the committed CSV is refreshed.
  const rows = [...catalog.values()].sort((a, b) =>
    a.barcode.localeCompare(b.barcode),
  );

  const byCategory = new Map<string, number>();
  for (const row of rows) {
    byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + 1);
  }

  mkdirSync("data", { recursive: true });
  writeFileSync(OUTPUT_PATH, encodeCsv(rows), "utf8");

  console.log(`\nWrote ${rows.length} unique products to ${OUTPUT_PATH}`);
  console.log("Category distribution:");
  for (const [category, count] of [...byCategory.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${category.padEnd(18)} ${count}`);
  }
  console.log(
    "\nNext: npm run seed:db (requires .env.local with the service-role key)",
  );
}

main().catch((error) => {
  console.error(
    "\nfetch-catalog failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
