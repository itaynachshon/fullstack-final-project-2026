/**
 * Catalog seeder — one-time, LOCAL script (IMPLEMENTATION_PLAN.md §6.2 step 2).
 *
 *   node scripts/seed-db.ts
 *
 * Loads data/catalog-seed.csv into the Supabase products table with
 * source='catalog' and created_by=NULL, using the SERVICE-ROLE key from
 * .env.local — the one credential that bypasses RLS, used here and nowhere in
 * runtime code (docs/TECHNICAL_DESIGN.md §3.4).
 *
 * Idempotent: existing barcodes are detected first and skipped, so re-running
 * after a partial failure (or after refreshing the CSV) only inserts what is
 * missing. Implementation note: PostgREST upsert cannot target the PARTIAL
 * unique index products_barcode_key (`WHERE barcode IS NOT NULL`) — plain
 * `ON CONFLICT (barcode)` does not infer a partial index — hence the
 * select-then-insert strategy instead of .upsert(), with a per-row fallback
 * if a batch still conflicts.
 */

import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { classifyBarcode } from "../src/lib/barcode/index.ts";
import { decodeCsv } from "./lib/catalogCsv.ts";

const CSV_PATH = "data/catalog-seed.csv";
const CHUNK_SIZE = 500;
const UNIQUE_VIOLATION = "23505";

function die(message: string): never {
  console.error(`\nseed-db failed: ${message}`);
  process.exit(1);
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

/* ── credentials (local only — see .env.example) ── */
try {
  process.loadEnvFile(".env.local");
} catch {
  die("no .env.local found — copy .env.example and fill in the Supabase values.");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  die(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in " +
      ".env.local (Supabase Dashboard → Project Settings → API).",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main(): Promise<void> {
  /* ── read + re-validate the committed CSV ── */
  let csvText: string;
  try {
    csvText = readFileSync(CSV_PATH, "utf8");
  } catch {
    die(`${CSV_PATH} not found — run \`npm run seed:fetch\` first.`);
  }

  const rows = decodeCsv(csvText);
  const seen = new Set<string>();
  const products = [];
  let rejected = 0;

  for (const row of rows) {
    // Defensive re-validation: the CSV is committed and human-editable.
    const classification = classifyBarcode(row.barcode);
    const valid =
      classification.kind === "gtin" &&
      classification.canonical === row.barcode &&
      row.name.length > 0 &&
      !seen.has(row.barcode);
    if (!valid) {
      rejected++;
      continue;
    }
    seen.add(row.barcode);
    products.push({
      barcode: row.barcode,
      name: row.name,
      brand: row.brand || null,
      package_size: row.package_size || null,
      category: row.category,
      image_url: null,
      source: "catalog",
      created_by: null,
    });
  }

  console.log(
    `${CSV_PATH}: ${rows.length} rows, ${products.length} valid products` +
      (rejected > 0 ? `, ${rejected} rejected by re-validation` : ""),
  );

  /* ── which barcodes already exist? (idempotent re-runs) ── */
  const existing = new Set<string>();
  for (const chunk of chunks(products.map((p) => p.barcode), CHUNK_SIZE)) {
    const { data, error } = await supabase.from("products").select("barcode").in("barcode", chunk);
    if (error) die(`reading existing barcodes: ${error.message}`);
    for (const row of data) existing.add(row.barcode as string);
  }

  const missing = products.filter((product) => !existing.has(product.barcode));
  console.log(`${existing.size} already in the database, inserting ${missing.length}`);

  /* ── batch inserts, per-row fallback on an unexpected conflict ── */
  let inserted = 0;
  for (const chunk of chunks(missing, CHUNK_SIZE)) {
    const { error } = await supabase.from("products").insert(chunk);
    if (!error) {
      inserted += chunk.length;
    } else if (error.code === UNIQUE_VIOLATION) {
      for (const product of chunk) {
        const { error: rowError } = await supabase.from("products").insert(product);
        if (!rowError) inserted++;
        else if (rowError.code !== UNIQUE_VIOLATION) {
          die(`inserting ${product.barcode}: ${rowError.message}`);
        }
      }
    } else {
      die(`batch insert: ${error.message}`);
    }
    process.stdout.write(`\rinserted ${inserted}/${missing.length}`);
  }

  console.log(`\nDone: ${inserted} inserted, ${existing.size} skipped (already present).`);
}

main().catch((error) => {
  die(error instanceof Error ? error.message : String(error));
});
