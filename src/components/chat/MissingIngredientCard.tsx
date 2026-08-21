import { CircleHelpIcon } from "@/components/icons";
import { cn } from "@/components/ui/utils";
import type { RecipeIngredient } from "@/lib/v2/types";

import { missingIngredientReplies } from "./copy";

/**
 * The `missing_ingredient` part: the assistant is UNCERTAIN about an
 * ingredient that isn't in the tracked fridge — the copy must never assert
 * the user doesn't have it (core V2 behavior, docs/FEATURES_V2_PLAN.md).
 * The model's own `question` already carries that phrasing; the fallback
 * below preserves it for degraded/legacy parts.
 *
 * The quick replies send ORDINARY chat messages — they never mutate the
 * fridge. Any actual add happens later through an explicit action proposal.
 */
export function MissingIngredientCard({
  ingredient,
  question,
  onReply,
  actionsDisabled = false,
}: {
  ingredient: RecipeIngredient;
  question?: string;
  /** Sends a normal chat message; omit to render read-only. */
  onReply?: (message: string) => void;
  actionsDisabled?: boolean;
}) {
  const name = ingredient.name.trim() || "this ingredient";
  const prompt =
    question?.trim() ||
    `I don't see ${name} in your tracked fridge — do you actually have some?`;
  const replies = missingIngredientReplies(name);

  const chips: { label: string; message: string }[] = [
    { label: "Yes, I have it", message: replies.haveIt },
    { label: "I don't have it", message: replies.dontHaveIt },
    { label: "Suggest an alternative", message: replies.substitute },
  ];

  return (
    <div className="rounded-xl border border-dashed bg-card px-4 py-3">
      <div className="flex items-start gap-2.5">
        <CircleHelpIcon
          className="mt-0.5 size-4.5 shrink-0 text-warning-foreground"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p dir="auto" className="text-sm font-medium break-words">
            {name}
          </p>
          <p dir="auto" className="mt-0.5 text-sm text-muted-foreground">
            {prompt}
          </p>
        </div>
      </div>
      {onReply ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              disabled={actionsDisabled}
              onClick={() => onReply(chip.message)}
              className={cn(
                "min-h-9 rounded-full border bg-background px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 outline-none",
                "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "disabled:pointer-events-none disabled:opacity-60 motion-reduce:transition-none",
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
