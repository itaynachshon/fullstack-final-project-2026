import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fridge loading state — skeletons mirror the final layout (header, pills,
 * one category section of cards) per docs/UI_DESIGN.md §9. Never a full-page
 * spinner.
 */
export default function FridgeLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl xl:max-w-6xl">
      <div className="pt-4 pb-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="mt-2 h-4 w-40" />
      </div>
      <div className="mt-2 flex gap-2">
        <Skeleton className="h-9 w-16 rounded-full" />
        <Skeleton className="h-9 w-20 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>
      <div className="mt-6">
        <Skeleton className="h-4 w-20" />
        <div className="mt-3 grid gap-2 md:grid-cols-2 md:gap-3 xl:grid-cols-3">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex gap-3 rounded-xl border bg-card p-3">
              <Skeleton className="size-14 shrink-0" />
              <div className="flex-1">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="mt-2 h-4 w-1/2" />
                <Skeleton className="mt-3 h-11 w-24 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
