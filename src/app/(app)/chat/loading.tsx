import { Skeleton } from "@/components/ui/skeleton";

/** Chat loading state — header, a short thread, and the composer bar. */
export default function ChatLoading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col">
      <div className="pt-4 pb-2 md:pt-6">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </div>
      <div className="flex flex-col gap-4 py-4">
        <Skeleton className="h-10 w-3/5 self-end rounded-2xl" />
        <Skeleton className="h-24 w-4/5 rounded-xl" />
        <Skeleton className="h-10 w-2/5 self-end rounded-2xl" />
      </div>
      <div className="mt-auto pb-1">
        <Skeleton className="h-14 w-full rounded-2xl" />
      </div>
    </div>
  );
}
