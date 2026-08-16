"use client";

/**
 * Client panel for the standalone /scan-test page (Wave 2 Agent C dev tool).
 *
 * Exercises <BarcodeScanner> through the frozen contract exactly the way the
 * Wave 3 add flow will: `onDetected` records the raw code and flips `paused`
 * to true; "Scan another" flips it back to false, which re-arms the scanner.
 * The callback counter makes duplicate-suppression observable on a real
 * device — each successful scan must raise it by exactly one.
 *
 * Deliberately no product lookup, no database writes, no fridge actions.
 */

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";

import { BarcodeScanner } from "./BarcodeScanner";

export function ScanTestPanel() {
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [callbackCount, setCallbackCount] = useState(0);
  const [pausedAfterDetection, setPausedAfterDetection] = useState(false);

  const handleDetected = useCallback((raw: string) => {
    setLastCode(raw);
    setCallbackCount((count) => count + 1);
    setPausedAfterDetection(true);
  }, []);

  const handleScanAnother = useCallback(() => {
    setPausedAfterDetection(false);
  }, []);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Scanner test</h1>
        <p className="text-xs text-muted-foreground">
          Development page for the barcode scanner component. Detected codes are
          shown exactly as read — nothing is looked up, saved, or sent anywhere.
        </p>
      </header>

      <BarcodeScanner
        onDetected={handleDetected}
        paused={pausedAfterDetection}
      />

      <section
        aria-label="Scan result"
        className="rounded-xl border bg-card p-4"
      >
        <h2 className="text-base font-semibold">Result</h2>
        <dl className="mt-3 space-y-3">
          <div>
            <dt className="text-xs text-muted-foreground">
              Detected barcode (raw, unvalidated)
            </dt>
            <dd
              aria-live="polite"
              dir="ltr"
              className="mt-1 text-base font-semibold tabular-nums"
            >
              {lastCode ?? "None yet"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              onDetected callbacks received
            </dt>
            <dd className="mt-1 text-base font-semibold tabular-nums">
              {callbackCount}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              paused prop (parent-controlled)
            </dt>
            <dd className="mt-1 text-base font-semibold">
              {pausedAfterDetection
                ? "true — scanner locked"
                : "false — scanning allowed"}
            </dd>
          </div>
        </dl>
        <Button
          variant="secondary"
          className="mt-4 w-full"
          onClick={handleScanAnother}
          disabled={!pausedAfterDetection}
        >
          Scan another
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          “Scan another” re-arms the scanner by flipping the paused prop back to
          false — the same contract the add flow uses. Each successful scan
          should raise the callback counter by exactly one.
        </p>
      </section>

      <p className="text-xs text-muted-foreground">
        Can’t use the camera? Barcodes can always be typed manually on the Add
        product page — this page only tests the scanner itself.
      </p>
    </div>
  );
}
