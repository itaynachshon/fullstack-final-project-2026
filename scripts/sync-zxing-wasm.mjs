/**
 * Sync the ZXing WASM decoder binary into public/ for same-origin serving.
 *
 * The barcode scanner decodes with zxing-wasm, whose default is to fetch
 * `zxing_reader.wasm` from the jsDelivr CDN at runtime. The approved design
 * (docs/TECHNICAL_DESIGN.md §9.3) requires the binary to be served from OUR
 * origin, so this script copies the exact binary of the INSTALLED package
 * version into `public/wasm/` — guaranteeing the served file can never drift
 * from the installed decoder JS.
 *
 * It runs automatically via the `predev`, `prebuild`, and `pretest` hooks in
 * package.json (no manual step, works locally and on Vercel). The copy is
 * verified byte-for-byte after writing. `public/wasm/` is gitignored: the
 * binary is derived from node_modules, not source.
 *
 * The scanner-side override that points the decoder at the public path lives
 * in src/components/scanner/zxing-config.ts.
 */

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const source = join(
  root,
  "node_modules",
  "zxing-wasm",
  "dist",
  "reader",
  "zxing_reader.wasm",
);
const targetDir = join(root, "public", "wasm");
const target = join(targetDir, "zxing_reader.wasm");

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

const sourceBytes = await readFile(source).catch(() => {
  console.error(
    "sync-zxing-wasm: zxing-wasm is not installed (run `npm install` first).",
  );
  process.exit(1);
});

await mkdir(targetDir, { recursive: true });
await copyFile(source, target);

const targetBytes = await readFile(target);
if (sha256(sourceBytes) !== sha256(targetBytes)) {
  console.error("sync-zxing-wasm: copy verification failed (hash mismatch).");
  process.exit(1);
}

const { version } = JSON.parse(
  await readFile(
    join(root, "node_modules", "zxing-wasm", "package.json"),
    "utf8",
  ),
);
console.log(
  `sync-zxing-wasm: public/wasm/zxing_reader.wasm ← zxing-wasm@${version} (${(targetBytes.length / 1024).toFixed(0)} KiB, sha256 ${sha256(targetBytes).slice(0, 12)}…)`,
);
