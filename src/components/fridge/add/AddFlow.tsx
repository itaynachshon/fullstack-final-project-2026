"use client";

import { useRef, useState } from "react";

import {
  PencilLineIcon,
  ScanBarcodeIcon,
  SearchIcon,
  type IconProps,
} from "@/components/icons";
import { cn } from "@/components/ui/utils";

import { ManualPanel, type ManualPrefill } from "./ManualPanel";
import { ScanPanel } from "./ScanPanel";
import { SearchPanel } from "./SearchPanel";

/**
 * The Add Product experience (docs/UI_DESIGN.md §6.4): a 3-segment
 * Scan / Search / Manual switcher (ARIA tablist, arrow-key navigation, Scan
 * default — the primary flow). Switching is instant and non-destructive: all
 * three panels stay mounted, so typed search text and manual drafts survive.
 *
 * Handoffs (§6.4.1 states 8–9, §6.4.2 no-results) switch segments
 * programmatically with prefills; Wave 3's unknown-scan fallback enters the
 * same way — via props from URL params or the in-page callbacks.
 */

export type AddMode = "scan" | "search" | "manual";

const TABS: Array<{
  mode: AddMode;
  label: string;
  icon: (props: IconProps) => React.ReactElement;
}> = [
  { mode: "scan", label: "Scan", icon: ScanBarcodeIcon },
  { mode: "search", label: "Search", icon: SearchIcon },
  { mode: "manual", label: "Manual", icon: PencilLineIcon },
];

export function AddFlow({
  initialMode = "scan",
  initialBarcode,
}: {
  initialMode?: AddMode;
  initialBarcode?: string;
}) {
  const [mode, setMode] = useState<AddMode>(initialMode);
  const [prefill, setPrefill] = useState<ManualPrefill>(
    initialBarcode ? { barcode: initialBarcode, fromScan: true } : {},
  );
  const [prefillVersion, setPrefillVersion] = useState(
    initialBarcode ? 1 : 0,
  );
  const tabRefs = useRef<Map<AddMode, HTMLButtonElement>>(new Map());

  function goToManual(next: ManualPrefill) {
    setPrefill({ ...next, fromScan: Boolean(next.barcode) });
    setPrefillVersion((version) => version + 1);
    setMode("manual");
  }

  function onTablistKeyDown(event: React.KeyboardEvent) {
    const index = TABS.findIndex((tab) => tab.mode === mode);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft")
      nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = TABS[nextIndex].mode;
    setMode(next);
    tabRefs.current.get(next)?.focus();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="How to add a product"
        onKeyDown={onTablistKeyDown}
        className="grid h-11 grid-cols-3 gap-1 rounded-md bg-muted p-1"
      >
        {TABS.map(({ mode: tabMode, label, icon: Icon }) => {
          const selected = mode === tabMode;
          return (
            <button
              key={tabMode}
              ref={(node) => {
                if (node) tabRefs.current.set(tabMode, node);
              }}
              type="button"
              role="tab"
              id={`add-tab-${tabMode}`}
              aria-selected={selected}
              aria-controls={`add-panel-${tabMode}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setMode(tabMode)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-sm text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                selected
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          );
        })}
      </div>

      {/* All panels stay mounted — segment switches are non-destructive. */}
      <div
        role="tabpanel"
        id="add-panel-scan"
        aria-labelledby="add-tab-scan"
        hidden={mode !== "scan"}
        className="pt-6"
      >
        <ScanPanel onManualHandoff={goToManual} />
      </div>
      <div
        role="tabpanel"
        id="add-panel-search"
        aria-labelledby="add-tab-search"
        hidden={mode !== "search"}
        className="pt-6"
      >
        <SearchPanel onManualHandoff={goToManual} />
      </div>
      <div
        role="tabpanel"
        id="add-panel-manual"
        aria-labelledby="add-tab-manual"
        hidden={mode !== "manual"}
        className="pt-6"
      >
        <ManualPanel prefill={prefill} prefillVersion={prefillVersion} />
      </div>
    </div>
  );
}
