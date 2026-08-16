"use client";

import { useEffect, useRef, useState } from "react";

import { useToast } from "@/components/app-shell/Toaster";
import {
  LoaderCircleIcon,
  PlusIcon,
  SearchIcon,
  SearchXIcon,
  WifiOffIcon,
  XIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { addToFridge } from "@/lib/actions/fridge";
import type { Product, SearchResponse } from "@/lib/types";

import { EmptyState } from "../EmptyState";
import { ProductCard } from "../ProductCard";
import { ConfirmSheet } from "./ConfirmSheet";

/**
 * Search mode (docs/UI_DESIGN.md §6.4.2) against the frozen
 * GET /api/products/search contract (min 1 / max 60 chars, page size 20,
 * hasMore): 300ms debounce, skeleton first page, explicit "Show more"
 * pagination (rows never unmount), and the shared confirm sheet. The query
 * survives adding — users add several items from one search.
 */

const DEBOUNCE_MS = 300;
const SKELETON_ROWS = 6;

type SearchPhase = "idle" | "loading" | "loaded" | "error";

export function SearchPanel({
  onManualHandoff,
}: {
  /** No-results/error escape hatch → Manual segment, name prefilled. */
  onManualHandoff: (prefill: { name?: string }) => void;
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<SearchPhase>("idle");
  const [results, setResults] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim().slice(0, 60);

  // Clearing the query resets to the pre-query state — render-time state
  // adjustment (no effect → no cascading render).
  const [lastQuery, setLastQuery] = useState(trimmed);
  if (lastQuery !== trimmed) {
    setLastQuery(trimmed);
    if (trimmed.length === 0) {
      setPhase("idle");
      setResults([]);
      setHasMore(false);
    }
  }

  // Debounced first-page search; stale responses are aborted, input is never
  // reset by the machinery (§6.4.2 interaction quality).
  useEffect(() => {
    if (trimmed.length === 0) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPhase("loading");
      try {
        const response = await fetch(
          `/api/products/search?q=${encodeURIComponent(trimmed)}&page=1`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(`search ${response.status}`);
        const body = (await response.json()) as SearchResponse;
        setResults(body.items);
        setPage(1);
        setHasMore(body.hasMore);
        setPhase("loaded");
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("search failed:", error);
        setPhase("error");
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, reloadNonce]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const response = await fetch(
        `/api/products/search?q=${encodeURIComponent(trimmed)}&page=${page + 1}`,
      );
      if (!response.ok) throw new Error(`search ${response.status}`);
      const body = (await response.json()) as SearchResponse;
      // Existing rows never unmount; the next page appends.
      setResults((current) => [...current, ...body.items]);
      setPage(body.page);
      setHasMore(body.hasMore);
    } catch (error) {
      console.error("search page failed:", error);
      toast({
        message: "Couldn't load more results — try again.",
        tone: "destructive",
      });
    } finally {
      setLoadingMore(false);
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
    // Back to the results with the query intact — add several from one search.
    setSelected(null);
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
        <label htmlFor="product-search" className="sr-only">
          Search the product catalog
        </label>
        <Input
          ref={inputRef}
          id="product-search"
          type="search"
          dir="auto"
          maxLength={60}
          autoComplete="off"
          placeholder="Search by name — חלב, במבה, cottage…"
          className="px-10 [&::-webkit-search-cancel-button]:hidden"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query.length > 0 && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute top-1/2 right-1 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>

      {/* Result-count announcements for screen readers (§11). */}
      <p aria-live="polite" className="sr-only">
        {phase === "loaded" &&
          (results.length === 0
            ? "No results"
            : `${results.length} result${results.length === 1 ? "" : "s"}`)}
      </p>

      {phase === "idle" && (
        <EmptyState
          icon={SearchIcon}
          title="Search 8,000+ Israeli products"
          body="Hebrew or English names both work."
        />
      )}

      {phase === "loading" && (
        <ul className="space-y-2">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <li
              key={index}
              className="flex items-center gap-3 rounded-xl border bg-card p-3"
            >
              <Skeleton className="size-12 shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {phase === "error" && (
        <EmptyState
          icon={WifiOffIcon}
          title="Couldn't reach the catalog"
          body="Check your connection and try again."
          action={
            <div className="flex flex-col items-center gap-2">
              <Button onClick={() => setReloadNonce((nonce) => nonce + 1)}>
                Retry
              </Button>
              <Button
                variant="ghost"
                onClick={() => onManualHandoff({ name: trimmed })}
              >
                Add it manually
              </Button>
            </div>
          }
        />
      )}

      {phase === "loaded" && results.length === 0 && (
        <EmptyState
          icon={SearchXIcon}
          title={
            <>
              Nothing for &ldquo;<span dir="auto">{trimmed}</span>&rdquo;
            </>
          }
          body="Check the spelling — or add it yourself in a few seconds."
          action={
            <Button
              variant="secondary"
              onClick={() => onManualHandoff({ name: trimmed })}
            >
              Add it manually
            </Button>
          }
        />
      )}

      {phase === "loaded" && results.length > 0 && (
        <>
          <ul className="space-y-2">
            {results.map((product) => (
              <li key={product.id}>
                <ProductCard
                  variant="search-result"
                  product={product}
                  onSelect={() => setSelected(product)}
                  trailing={
                    <span
                      aria-hidden="true"
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
                    >
                      <PlusIcon className="size-5" />
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
          {hasMore && (
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? (
                <>
                  <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
                  Loading…
                </>
              ) : (
                "Show more"
              )}
            </Button>
          )}
        </>
      )}

      <ConfirmSheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        product={selected}
        onConfirm={
          selected ? (units) => confirmAdd(selected, units) : undefined
        }
      />
    </div>
  );
}
