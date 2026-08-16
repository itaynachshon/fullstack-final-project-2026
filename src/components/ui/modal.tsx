"use client";

/**
 * Modal primitive built on the native <dialog> element — no Radix/vaul
 * dependency (dependency set is frozen). `showModal()` provides the top
 * layer, focus trapping, Esc-to-close, and focus restoration natively.
 *
 * Two shapes per docs/UI_DESIGN.md §8:
 *  - "sheet":  bottom sheet on phones (rounded top, drag-handle bar),
 *              centered max-w-sm dialog from md up.
 *  - "dialog": centered dialog at every size (delete confirmations).
 *
 * Elevation level 2: shadow-lg over a bg-black/40 scrim (UI_DESIGN §3.5).
 * Enter motion: 300ms slide-up (sheet) / 200ms scale-fade (dialog), disabled
 * under prefers-reduced-motion (UI_DESIGN §12).
 */

import { useEffect, useRef } from "react";

import { cn } from "./utils";

export interface ModalProps {
  open: boolean;
  /** Called whenever the dialog closes (Esc, scrim tap, or a close button). */
  onClose: () => void;
  variant?: "sheet" | "dialog";
  ariaLabel?: string;
  labelledBy?: string;
  className?: string;
  children: React.ReactNode;
}

export function Modal({
  open,
  onClose,
  variant = "sheet",
  ariaLabel,
  labelledBy,
  className,
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      // Closing while attached lets the browser restore focus to the trigger.
      dialog.close();
    }
  }, [open]);

  // The top layer blocks interaction, but not wheel/touch scrolling of the
  // page behind the scrim — lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const isSheet = variant === "sheet";

  return (
    <dialog
      ref={dialogRef}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onClick={(event) => {
        // Clicks on ::backdrop dispatch with the dialog itself as target.
        if (event.target === event.currentTarget) {
          dialogRef.current?.close();
        }
      }}
      className={cn(
        "max-h-[85dvh] overflow-y-auto bg-card p-0 text-foreground shadow-lg outline-none backdrop:bg-black/40 motion-reduce:animate-none",
        isSheet
          ? "m-0 mt-auto w-full max-w-full animate-sheet-in rounded-t-xl pb-[env(safe-area-inset-bottom)] md:m-auto md:w-[calc(100%-48px)] md:max-w-sm md:animate-dialog-in md:rounded-xl md:pb-0"
          : "m-auto w-[calc(100%-32px)] max-w-sm animate-dialog-in rounded-xl",
      )}
    >
      {isSheet && (
        <div
          aria-hidden="true"
          className="mx-auto mt-2 h-1 w-8 rounded-full bg-muted md:hidden"
        />
      )}
      <div className={cn("px-4 pt-3 pb-6 md:px-6 md:pt-5", className)}>
        {children}
      </div>
    </dialog>
  );
}
