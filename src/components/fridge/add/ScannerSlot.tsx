"use client";

import { CameraIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

/**
 * WAVE 3 INTEGRATION BOUNDARY — the scanner mounts here.
 *
 * This placeholder reserves the exact viewport geometry from
 * docs/UI_DESIGN.md §6.4.1 (full gutter width, 4:3, rounded-lg, capped on
 * larger screens) and mirrors the scanner's pre-permission idle panel, so
 * swapping in the real component changes nothing around it.
 *
 * Wave 3 replaces the placeholder body with Agent C's frozen contract:
 *
 *   <BarcodeScanner onDetected={onDetected} />
 *
 * `onDetected` is already wired: it feeds the same lookup pipeline the
 * manual barcode block below uses (ScanPanel.lookUp), so detection → lookup
 * sheet → confirm/manual-handoff all work the moment the scanner lands.
 * Agent B must not implement any camera/decoding logic here (plan §20).
 */
export function ScannerSlot({
  onDetected,
}: {
  onDetected: (raw: string) => void;
}) {
  // Accepted now, consumed in Wave 3 by the one-line
  // <BarcodeScanner onDetected={onDetected} /> swap.
  void onDetected;

  return (
    <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-lg bg-muted px-6 text-center md:max-h-[420px]">
      <CameraIcon className="size-8 text-muted-foreground" aria-hidden="true" />
      <h3 className="mt-3 text-base font-semibold">
        Scan barcodes with your camera
      </h3>
      <p className="text-xs text-muted-foreground">
        The camera is used for scanning only — nothing is recorded.
      </p>
      <Button className="mt-4" disabled>
        Enable camera
      </Button>
      <p className="mt-1 text-xs text-muted-foreground">
        Camera scanning arrives in the next update — type the code below
        instead.
      </p>
    </div>
  );
}
