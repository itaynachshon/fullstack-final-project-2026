"use client";

import { useState, useTransition } from "react";

import { useToast } from "@/components/app-shell/Toaster";
import {
  CheckIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { restockItem } from "@/lib/actions/fridge";

/**
 * One-tap restock (docs/UI_DESIGN.md §6.5): "I bought another one" — inserts
 * a fresh 100% unit via the restockItem action; the referenced row is
 * untouched history. On success the button morphs to a check + "Added" for
 * 800ms and a toast confirms; failures surface as a destructive toast.
 */
export function RestockButton({
  itemId,
  productName,
  onRestocked,
}: {
  itemId: string;
  productName: string;
  /** Fired after the 800ms "Added" hold (finished rows collapse on it). */
  onRestocked?: () => void;
}) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<"idle" | "pending" | "added">("idle");
  const [, startTransition] = useTransition();

  function handleRestock() {
    if (phase !== "idle") return;
    setPhase("pending");
    startTransition(async () => {
      const result = await restockItem({ itemId });
      if (result.ok) {
        setPhase("added");
        toast({ message: `${productName} added to your fridge` });
        window.setTimeout(() => onRestocked?.(), 800);
      } else {
        setPhase("idle");
        toast({ message: result.error.message, tone: "destructive" });
      }
    });
  }

  return (
    <Button
      variant="secondary"
      onClick={handleRestock}
      disabled={phase !== "idle"}
      aria-label={`Restock ${productName}`}
      className="shrink-0"
    >
      {phase === "pending" ? (
        <>
          <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
          Adding…
        </>
      ) : phase === "added" ? (
        <>
          <CheckIcon className="size-4" />
          Added
        </>
      ) : (
        <>
          <RotateCcwIcon className="size-4" />
          Restock
        </>
      )}
    </Button>
  );
}
