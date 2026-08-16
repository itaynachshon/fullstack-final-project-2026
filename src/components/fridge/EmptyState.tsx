import { cn } from "@/components/ui/utils";
import type { IconProps } from "@/components/icons";

/**
 * The shared empty-state block (docs/UI_DESIGN.md §9): centered, py-12,
 * 64px muted circle with a 32px muted icon, style-2 title, muted body capped
 * at 36ch, optional single action. Copy comes verbatim from the §9 table at
 * each call site — every state tells the user what to do next.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon: (props: IconProps) => React.ReactElement;
  title: React.ReactNode;
  body: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center px-4 py-12 text-center",
        className,
      )}
    >
      <div className="flex size-16 items-center justify-center rounded-full bg-muted">
        <Icon className="size-8 text-muted-foreground" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      <p className="mt-1 max-w-[36ch] text-sm text-muted-foreground">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
