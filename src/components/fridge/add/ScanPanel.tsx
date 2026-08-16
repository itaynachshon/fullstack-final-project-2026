"use client";

import { useEffect, useRef, useState } from "react";

import { useToast } from "@/components/app-shell/Toaster";
import {
  CircleAlertIcon,
  LoaderCircleIcon,
  ScanBarcodeIcon,
  SearchXIcon,
  WeightIcon,
  WifiOffIcon,
} from "@/components/icons";
import { BarcodeScanner } from "@/components/scanner/BarcodeScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { addToFridge } from "@/lib/actions/fridge";
import type { LookupResponse, Product } from "@/lib/types";

import { EmptyState } from "../EmptyState";
import { ConfirmSheet } from "./ConfirmSheet";
import { decideScan, outcomeOf } from "./scan-flow";

/**
 * Scan mode (docs/UI_DESIGN.md §6.4.1): the real camera scanner above the
 * permanently visible manual barcode block — the fallback is first-class by
 * construction, never revealed only on failure (plan §16).
 *
 * Scanner integration (Wave 3):
 *  - The scanner emits raw codes through the frozen `onDetected` contract;
 *    everything after detection is owned here (classify → lookup → sheets),
 *    with the routing rules in scan-flow.ts.
 *  - `paused` is true whenever a detection is being handled — lookup in
 *    flight, any sheet open, the misread pill showing, or the Scan tab not
 *    active (all panels stay mounted, and a hidden tab must not keep the
 *    camera decoding). The scanner re-arms itself on the paused true → false
 *    edge, which yields the §6.4.1 state-7 behavior: after an add or a sheet
 *    dismissal, scanning resumes with zero taps.
 *  - A misread (state 5) is calm and transient: caption pill "Didn't catch
 *    that — hold steady" for 1.5s, then scanning auto-resumes. No sheet,
 *    no red. Typed codes get a field error instead.
 */

const MISREAD_RESET_MS = 1500;

const TYPED_INVALID_ERROR =
  "That code doesn't look right — check the digits under the lines.";

type LookupPhase =
  | { kind: "idle" }
  | { kind: "misread" }
  | { kind: "looking" }
  | { kind: "found"; product: Product }
  | { kind: "not_found"; barcode: string }
  | { kind: "rcn" }
  | { kind: "network"; barcode: string };

/** Where the code came from — decides how an invalid code is surfaced. */
type LookupOrigin = "scan" | "typed";

export function ScanPanel({
  active,
  onManualHandoff,
}: {
  /** False while another Add tab is selected — the camera must not decode. */
  active: boolean;
  /** Switches to the Manual segment with optional prefills (§6.4.1 states 8–10). */
  onManualHandoff: (prefill: { barcode?: string }) => void;
}) {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [phase, setPhase] = useState<LookupPhase>({ kind: "idle" });

  // The misread pill dismisses itself; the timer is cleared when anything
  // else starts (new lookup) or the panel unmounts.
  const misreadTimer = useRef<number | null>(null);
  function clearMisreadTimer() {
    if (misreadTimer.current !== null) {
      window.clearTimeout(misreadTimer.current);
      misreadTimer.current = null;
    }
  }
  useEffect(() => clearMisreadTimer, []);

  async function lookUp(raw: string, origin: LookupOrigin) {
    clearMisreadTimer();

    const decision = decideScan(raw);
    if (decision.action === "reject") {
      if (origin === "scan") {
        // §6.4.1 state 5: transient pill, then scanning resumes by itself.
        setPhase({ kind: "misread" });
        misreadTimer.current = window.setTimeout(() => {
          misreadTimer.current = null;
          setPhase((current) =>
            current.kind === "misread" ? { kind: "idle" } : current,
          );
        }, MISREAD_RESET_MS);
      } else {
        setFieldError(TYPED_INVALID_ERROR);
      }
      return;
    }
    if (decision.action === "rcn") {
      setPhase({ kind: "rcn" });
      return;
    }

    setFieldError(null);
    setPhase({ kind: "looking" });
    try {
      const response = await fetch(
        `/api/products/lookup?barcode=${encodeURIComponent(decision.canonical)}`,
      );
      if (!response.ok) {
        setPhase({ kind: "network", barcode: decision.canonical });
        return;
      }
      const outcome = outcomeOf((await response.json()) as LookupResponse);
      switch (outcome.kind) {
        case "found":
          setPhase({ kind: "found", product: outcome.product });
          return;
        case "not_found":
          setPhase({ kind: "not_found", barcode: outcome.barcode });
          return;
        case "rcn":
          setPhase({ kind: "rcn" });
          return;
        case "invalid":
          // Client and server share the classifier, so this is unreachable
          // in practice — degrade exactly like a client-side reject.
          setPhase({ kind: "idle" });
          if (origin === "typed") setFieldError(TYPED_INVALID_ERROR);
          return;
      }
    } catch {
      setPhase({ kind: "network", barcode: decision.canonical });
    }
  }

  async function confirmAdd(product: Product, units: number) {
    const result = await addToFridge({ productId: product.id, units });
    if (!result.ok) {
      toast({ message: result.error.message, tone: "destructive" });
      return;
    }
    toast({
      message: `Added ${product.name}${units > 1 ? ` ×${units}` : ""}`,
    });
    // Back to idle → the paused edge re-arms the scanner (§6.4.1 state 7:
    // "scanner auto-resumes — re-arming must cost zero taps").
    setPhase({ kind: "idle" });
    setCode("");
  }

  const dismiss = () => setPhase({ kind: "idle" });
  const sheetOpen =
    phase.kind === "looking" ||
    phase.kind === "not_found" ||
    phase.kind === "rcn" ||
    phase.kind === "network";

  // Camera decodes only while this tab is active and nothing is being
  // handled. Every non-idle phase suppresses detection; returning to idle
  // flips paused false, which re-arms a locked scanner.
  const scannerPaused = !active || phase.kind !== "idle";

  return (
    <div className="space-y-6">
      <div className="relative">
        <BarcodeScanner
          onDetected={(raw) => void lookUp(raw, "scan")}
          paused={scannerPaused}
        />
        {phase.kind === "misread" && (
          <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs whitespace-nowrap text-white">
            Didn&rsquo;t catch that — hold steady
          </p>
        )}
      </div>

      {/* Polite announcements for scanner/lookup state changes (§11). */}
      <p aria-live="polite" className="sr-only">
        {phase.kind === "misread" && "Didn't catch that — hold steady"}
        {phase.kind === "looking" && "Looking it up…"}
        {phase.kind === "not_found" && "We don't know this barcode yet"}
        {phase.kind === "rcn" && "Looks like a weighed item"}
        {phase.kind === "network" && "Couldn't reach the catalog"}
      </p>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void lookUp(code, "typed");
        }}
        className="space-y-1.5"
      >
        <label htmlFor="manual-barcode" className="text-sm font-medium">
          Or type the barcode
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <ScanBarcodeIcon className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="manual-barcode"
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 7290000066318"
              className="pl-10"
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                if (fieldError) setFieldError(null);
              }}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? "manual-barcode-error" : undefined}
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            size="lg"
            disabled={phase.kind === "looking" || code.trim().length === 0}
          >
            {phase.kind === "looking" ? (
              <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
            ) : null}
            Look up
          </Button>
        </div>
        {fieldError && (
          <p
            id="manual-barcode-error"
            className="flex items-center gap-1 text-xs text-destructive"
          >
            <CircleAlertIcon className="size-3.5 shrink-0" />
            {fieldError}
          </p>
        )}
      </form>

      {/* States 6 / 8 / 9 / 10 — one sheet, content by phase. */}
      <Modal
        open={sheetOpen}
        onClose={dismiss}
        variant="sheet"
        ariaLabel="Barcode lookup"
      >
        {phase.kind === "looking" && (
          <div className="flex items-center gap-3 py-2">
            <Skeleton className="size-16 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        )}
        {phase.kind === "looking" && (
          <p className="mt-2 text-xs text-muted-foreground">Looking it up…</p>
        )}

        {phase.kind === "not_found" && (
          <>
            <EmptyState
              className="py-6"
              icon={SearchXIcon}
              title="We don't know this barcode yet"
              body="Add it once — it's saved to the shared catalog for everyone."
            />
            <div className="space-y-2">
              <Button
                size="lg"
                className="w-full"
                onClick={() => {
                  const { barcode } = phase;
                  dismiss();
                  onManualHandoff({ barcode });
                }}
              >
                Add details manually
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="w-full"
                onClick={dismiss}
              >
                Scan again
              </Button>
            </div>
          </>
        )}

        {phase.kind === "rcn" && (
          <>
            <EmptyState
              className="py-6"
              icon={WeightIcon}
              title="Looks like a weighed item"
              body="Store scales print their own labels, so there's nothing to look up. Add it manually instead."
            />
            <div className="space-y-2">
              <Button
                size="lg"
                className="w-full"
                onClick={() => {
                  dismiss();
                  // Plan §6.1: RCN handoff clears the barcode field.
                  onManualHandoff({});
                }}
              >
                Add manually
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="w-full"
                onClick={dismiss}
              >
                Scan again
              </Button>
            </div>
          </>
        )}

        {phase.kind === "network" && (
          <>
            <EmptyState
              className="py-6"
              icon={WifiOffIcon}
              title="Couldn't reach the catalog"
              body="Check your connection and try again."
            />
            <div className="space-y-2">
              <Button
                size="lg"
                className="w-full"
                onClick={() => void lookUp(phase.barcode, "scan")}
              >
                Retry
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="w-full"
                onClick={() => {
                  const { barcode } = phase;
                  dismiss();
                  onManualHandoff({ barcode });
                }}
              >
                Enter it manually
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* State 7: found → the shared product-confirm sheet. */}
      <ConfirmSheet
        open={phase.kind === "found"}
        onClose={dismiss}
        product={phase.kind === "found" ? phase.product : null}
        secondaryLabel="Scan again"
        onConfirm={
          phase.kind === "found"
            ? (units) => confirmAdd(phase.product, units)
            : undefined
        }
      />
    </div>
  );
}
