import { Skeleton } from "@/components/ui/skeleton";

/** Restock loading state — skeleton sections mirroring the checklist layout. */
export default function RestockLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="pt-4 pb-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="mt-2 h-4 w-32" />
      </div>
      <div className="mt-4 space-y-8">
        {[0, 1].map((section) => (
          <div key={section}>
            <Skeleton className="h-5 w-36" />
            <div className="mt-3 space-y-2">
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  className="flex items-center gap-3 rounded-xl border bg-card p-3"
                >
                  <Skeleton className="size-12 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                  <Skeleton className="h-11 w-28 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
