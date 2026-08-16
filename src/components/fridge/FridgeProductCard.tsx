"use client";

import { useOptimistic, useState, useTransition } from "react";

import { useToast } from "@/components/app-shell/Toaster";
import { TriangleAlertIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { deleteItem, setRemaining } from "@/lib/actions/fridge";
import { levelLabel } from "@/lib/fridge/format";
import type { Product, RemainingLevel } from "@/lib/types";

import { ConsumeSheet } from "./ConsumeSheet";
import { ProductCard } from "./ProductCard";
import { RestockButton } from "./RestockButton";
import { UnitChip } from "./UnitChip";

/** Serializable unit shape passed down from the server page. */
export interface FridgeCardUnit {
  id: string;
  unitNumber: number;
  remainingPercent: RemainingLevel;
  addedAt: string;
  finishedAt: string | null;
}

/**
 * One fridge product card: the product's physical units as tappable chips,
 * the consumption sheet, and the optimistic update loop (docs/UI_DESIGN.md
 * §6.3/§8). Level changes apply instantly via useOptimistic, the sheet
 * auto-dismisses, and a toast confirms with Undo (re-issuing the previous
 * absolute level — safe because setRemaining is absolute and idempotent).
 * Server failure reverts the optimistic state and shows a destructive toast.
 */
export function FridgeProductCard({
  product,
  units,
  showRestock = false,
}: {
  product: Product;
  units: FridgeCardUnit[];
  /** Finished-filter cards get muted styling + a card-level Restock button. */
  showRestock?: boolean;
}) {
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [pendingUnitIds, setPendingUnitIds] = useState<ReadonlySet<string>>(
    new Set(),
  );

  const [optimisticUnits, applyOptimisticLevel] = useOptimistic(
    units,
    (state, change: { id: string; level: RemainingLevel }) =>
      state.map((unit) =>
        unit.id === change.id
          ? {
              ...unit,
              remainingPercent: change.level,
              finishedAt:
                change.level === 0 ? new Date().toISOString() : null,
            }
          : unit,
      ),
  );

  const selectedUnit =
    optimisticUnits.find((unit) => unit.id === selectedUnitId) ?? null;

  const markPending = (id: string, pending: boolean) =>
    setPendingUnitIds((current) => {
      const next = new Set(current);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });

  function performSetLevel(
    unit: FridgeCardUnit,
    level: RemainingLevel,
    options?: { isUndo: boolean },
  ) {
    const previousLevel = unit.remainingPercent;
    setSelectedUnitId(null);
    markPending(unit.id, true);
    startTransition(async () => {
      applyOptimisticLevel({ id: unit.id, level });
      const result = await setRemaining({
        itemId: unit.id,
        remainingPercent: level,
      });
      markPending(unit.id, false);
      if (!result.ok) {
        // The optimistic state reverts automatically when the transition
        // settles without fresh server data confirming the change.
        toast({
          message: "Couldn't save — check your connection",
          tone: "destructive",
        });
        return;
      }
      if (options?.isUndo) return;
      const undo = {
        label: "Undo",
        onClick: () => performSetLevel({ ...unit, remainingPercent: level }, previousLevel, { isUndo: true }),
      };
      toast(
        level === 0
          ? {
              message: `${product.name} finished — it's on your Restock list`,
              action: undo,
            }
          : { message: `Set to ${levelLabel(level)}`, action: undo },
      );
    });
  }

  function performDelete(unit: FridgeCardUnit) {
    setSelectedUnitId(null);
    markPending(unit.id, true);
    startTransition(async () => {
      const result = await deleteItem({ itemId: unit.id });
      markPending(unit.id, false);
      if (!result.ok) {
        toast({ message: result.error.message, tone: "destructive" });
      }
      // Success needs no toast: the unit visibly leaves the card.
    });
  }

  const lowBadge = optimisticUnits.some(
    (unit) => unit.remainingPercent === 25 && unit.finishedAt === null,
  ) ? (
    <Badge variant="warning">
      <TriangleAlertIcon className="size-3" />
      Low
    </Badge>
  ) : null;

  // Card-level restock references the most recently finished unit.
  const restockUnit = showRestock
    ? [...optimisticUnits].sort(
        (a, b) =>
          Date.parse(b.finishedAt ?? b.addedAt) -
          Date.parse(a.finishedAt ?? a.addedAt),
      )[0]
    : null;

  return (
    <>
      <ProductCard
        variant="fridge"
        product={product}
        badge={lowBadge}
        muted={showRestock}
      >
        {optimisticUnits.map((unit) => (
          <UnitChip
            key={unit.id}
            unitNumber={unit.unitNumber}
            level={unit.remainingPercent}
            pending={pendingUnitIds.has(unit.id)}
            onClick={() => setSelectedUnitId(unit.id)}
          />
        ))}
        {restockUnit ? (
          <RestockButton
            itemId={restockUnit.id}
            productName={product.name}
          />
        ) : null}
      </ProductCard>

      <ConsumeSheet
        open={selectedUnit !== null}
        onClose={() => setSelectedUnitId(null)}
        productName={product.name}
        unit={selectedUnit}
        onSelectLevel={(level) =>
          selectedUnit && performSetLevel(selectedUnit, level)
        }
        onDelete={() => selectedUnit && performDelete(selectedUnit)}
      />
    </>
  );
}
