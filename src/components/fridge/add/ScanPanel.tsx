"use client";

import { useState } from "react";

import { useToast } from "@/components/app-shell/Toaster";
import {
  CircleAlertIcon,
  LoaderCircleIcon,
  ScanBarcodeIcon,
  SearchXIcon,
  WeightIcon,
  WifiOffIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { addToFridge } from "@/lib/actions/fridge";
import { classifyBarcode } from "@/lib/fridge/barcode";
import type { LookupResponse, Product } from "@/lib/types";

import { EmptyState } from "../EmptyState";
import { ConfirmSheet } from "./ConfirmSheet";
import { ScannerSlot } from "./ScannerSlot";

/**
 * Scan mode (docs/UI_DESIGN.md §6.4.1): the scanner viewport (Wave 3 slot)
 * above the permanently visible manual barcode block — the fallback is
 * first-class by construction, never revealed only on failure (plan §16).
 *
 * The lookup pipeline (validate → GET /api/products/lookup → sheet states
 * 6–10) is fully implemented here against the frozen API shape; the future
 * scanner feeds detections into the same `lookUp` entry point.
 */

type LookupPhase =
  | { kind: "idle" }
  | { kind: "looking" }
  | { kind: "found"; product: Product }
  | { kind: "not_found"; barcode: string }
  | { kind: "rcn" }
  | { kind: "network"; barcode: string };

export function ScanPanel({
  onManualHandoff,
}: {
  /** Switches to the Manual segment with optional prefills (§6.4.1 states 8–10). */
  onManualHandoff: (prefill: { barcode?: string }) => void;
}) {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [phase, setPhase] = useState<LookupPhase>({ kind: "idle" });

  async function lookUp(raw: string) {
    // Client-side hygiene first (Wave 2 seam; Agent A's module replaces it in
    // Wave 3) — the API re-validates authoritatively either way.
    const classified = classifyBarcode(raw);
    if (classified.kind === "invalid") {
      setFieldError(
        "That code doesn't look right — check the digits under the lines.",
      );
      return;
    }
    if (classified.kind === "rcn") {
      setPhase({ kind: "rcn" });
      return;
    }

    setFieldError(null);
    setPhase({ kind: "looking" });
    try {
      const response = await fetch(
        `/api/products/lookup?barcode=${encodeURIComponent(classified.canonical)}`,
      );
      if (!response.ok) {
        setPhase({ kind: "network", barcode: classified.canonical });
        return;
      }
      const body = (await response.json()) as LookupResponse;
      switch (body.status) {
        case "found":
          setPhase({ kind: "found", product: body.product });
          return;
        case "not_found":
          setPhase({ kind: "not_found", barcode: body.barcode });
          return;
        case "rcn":
          setPhase({ kind: "rcn" });
          return;
        case "invalid":
          setPhase({ kind: "idle" });
          setFieldError(
            "That code doesn't look right — check the digits under the lines.",
          );
          return;
      }
    } catch {
      setPhase({ kind: "network", barcode: classified.canonical });
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
    setPhase({ kind: "idle" });
    setCode("");
  }

  const dismiss = () => setPhase({ kind: "idle" });
  const sheetOpen =
    phase.kind === "looking" ||
    phase.kind === "not_found" ||
    phase.kind === "rcn" ||
    phase.kind === "network";

  return (
    <div className="space-y-6">
      <ScannerSlot onDetected={lookUp} />

      {/* Polite announcements for scanner/lookup state changes (§11). */}
      <p aria-live="polite" className="sr-only">
        {phase.kind === "looking" && "Looking it up…"}
        {phase.kind === "not_found" && "We don't know this barcode yet"}
        {phase.kind === "rcn" && "Looks like a weighed item"}
        {phase.kind === "network" && "Couldn't reach the catalog"}
      </p>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void lookUp(code);
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
              <Button variant="ghost" size="lg" className="w-full" onClick={dismiss}>
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
              <Button variant="ghost" size="lg" className="w-full" onClick={dismiss}>
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
                onClick={() => void lookUp(phase.barcode)}
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
