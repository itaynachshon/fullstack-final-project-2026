/**
 * Self-hosted ZXing WASM configuration (docs/TECHNICAL_DESIGN.md §9.3: "The
 * ZXing WASM binary is served from our own origin — no third-party CDN at
 * demo time").
 *
 * zxing-wasm's default `locateFile` fetches the decoder binary from jsDelivr.
 * This module registers an override so the ponyfill chain
 * (@yudiel/react-qr-scanner → barcode-detector → zxing-wasm) loads it from
 * OUR origin instead. The file at `public/wasm/zxing_reader.wasm` is copied
 * from the installed package by `scripts/sync-zxing-wasm.mjs`, which runs
 * automatically before dev/test/build — so the served binary always matches
 * the installed zxing-wasm version.
 *
 * `prepareZXingModule` with only `overrides` just records the settings (no
 * network, no instantiation), so calling it before the scanner's first decode
 * is enough. Both this module and barcode-detector import the same zxing-wasm
 * module instance, so the override applies to the scanner's decoder.
 *
 * This module is imported ONLY from the lazy-loaded scanner chunk — it pulls
 * zxing-wasm's JS glue with it and must stay out of the eager page bundle.
 */

import { prepareZXingModule } from "zxing-wasm/reader";

/** Public URL the decoder binary is served from (same-origin). */
export const ZXING_WASM_PUBLIC_PATH = "/wasm/zxing_reader.wasm";

export function configureSelfHostedZXing(): void {
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith(".wasm") ? ZXING_WASM_PUBLIC_PATH : prefix + path,
    },
  });
}
