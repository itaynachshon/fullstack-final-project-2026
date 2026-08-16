"use client";

import { useState } from "react";

import { LoaderCircleIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { Product } from "@/lib/types";

import { ProductCard } from "../ProductCard";
import { UnitsStepper } from "./UnitsStepper";

/**
 * The product-confirm sheet (docs/UI_DESIGN.md §6.4.1 state 7) — the single
 * confirm surface app-wide: search selections, barcode lookups (typed now,
 * scanned in Wave 3), and the manual duplicate-barcode outcome all land here.
 * Product identity + unit count are unmissable before anything is written.
 */
export function ConfirmSheet({
  open,
  onClose,
  product,
  note,
  showStepper = true,
  confirmLabel = "Add to fridge",
  secondaryLabel,
  onSecondary,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  /** Extra meta note ("Already in the catalog — added your units."). */
  note?: string;
  showStepper?: boolean;
  confirmLabel?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Resolves when the add completes; the sheet shows pending meanwhile. */
  onConfirm?: (units: number) => Promise<void>;
}) {
  const [units, setUnits] = useState(1);
  const [pending, setPending] = useState(false);

  // Fresh product → fresh unit count (render-time adjustment, no effect).
  const [lastProductId, setLastProductId] = useState(product?.id);
  if (lastProductId !== product?.id) {
    setLastProductId(product?.id);
    setUnits(1);
  }

  const sourceNote =
    product?.source === "off" ? "Found on Open Food Facts" : undefined;

  async function handleConfirm() {
    if (!onConfirm || pending) return;
    setPending(true);
    try {
      await onConfirm(units);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="sheet"
      ariaLabel={product ? `Add ${product.name} to your fridge` : "Add product"}
    >
      {product && (
        <>
          <ProductCard variant="confirm" product={product} />
          {(note ?? sourceNote) && (
            <p className="mt-2 text-xs text-muted-foreground">
              {note ?? sourceNote}
            </p>
          )}

          {showStepper && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm font-medium">Units</span>
              <UnitsStepper
                value={units}
                onChange={setUnits}
                disabled={pending}
              />
            </div>
          )}

          <div className="mt-6 space-y-2">
            {onConfirm && (
              <Button
                size="lg"
                className="w-full"
                onClick={handleConfirm}
                disabled={pending}
              >
                {pending ? (
                  <>
                    <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
                    Adding…
                  </>
                ) : (
                  confirmLabel
                )}
              </Button>
            )}
            {secondaryLabel && (
              <Button
                variant="ghost"
                size="lg"
                className="w-full"
                disabled={pending}
                onClick={onSecondary ?? onClose}
              >
                {secondaryLabel}
              </Button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
