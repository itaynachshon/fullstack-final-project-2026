"use client";

import { useEffect } from "react";

import { EmptyState } from "@/components/fridge/EmptyState";
import { TriangleAlertIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

/**
 * Page-level crash boundary for the authenticated app (docs/UI_DESIGN.md §9):
 * calm, honest, recoverable — never a raw error.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App route crashed:", error);
  }, [error]);

  return (
    <EmptyState
      icon={TriangleAlertIcon}
      title="Something went wrong"
      body="It's us, not you. Try again — your fridge data is safe."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
