"use client";

/**
 * Minimal toast system — React context + local state, no library (sonner is
 * not in the approved Wave 1 dependency set and dependencies are frozen).
 *
 * Follows docs/UI_DESIGN.md §9: bottom-center, offset above the mobile nav,
 * elevation level 1 (border + shadow-md), rounded-full, one line + optional
 * action, announced via a polite live region.
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

import { cn } from "@/components/ui/utils";

export interface ToastOptions {
  message: string;
  tone?: "default" | "destructive";
  /** Optional trailing action, e.g. Undo. */
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return context;
}

const AUTO_DISMISS_MS = 4000;
const AUTO_DISMISS_WITH_ACTION_MS = 6000;
const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++;
      setToasts((current) =>
        [...current, { ...options, id }].slice(-MAX_VISIBLE),
      );
      const timeout = options.action
        ? AUTO_DISMISS_WITH_ACTION_MS
        : AUTO_DISMISS_MS;
      window.setTimeout(() => dismiss(id), timeout);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-[calc(72px+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 md:bottom-6"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto flex max-w-full min-w-0 items-center gap-3 rounded-full border bg-card py-2.5 pr-3 pl-4 text-sm shadow-md motion-safe:animate-toast-in",
              item.tone === "destructive"
                ? "border-destructive/30 text-destructive"
                : "border-border text-foreground",
            )}
          >
            <span dir="auto" className="min-w-0 truncate">
              {item.message}
            </span>
            {item.action ? (
              <button
                type="button"
                className="-my-2 shrink-0 rounded-full px-2 py-2 text-sm font-medium text-primary outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  item.action?.onClick();
                  dismiss(item.id);
                }}
              >
                {item.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
