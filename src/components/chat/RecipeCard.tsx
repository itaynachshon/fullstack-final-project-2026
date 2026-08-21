import {
  CheckIcon,
  CircleHelpIcon,
  CookingPotIcon,
  XIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/utils";
import type { IngredientAvailability, Recipe } from "@/lib/v2/types";

import { COOKED_THIS_MESSAGE } from "./copy";

/**
 * Availability semantics (docs/FEATURES_V2_PLAN.md — the tracked-fridge
 * uncertainty model): "have" = matched in the tracked fridge; "unconfirmed" =
 * NOT SEEN in the tracked fridge, which is NOT the same as absent from the
 * kitchen; "missing" = confirmed missing (e.g. the user said so). Icon + text
 * together — never color alone (docs/UI_DESIGN.md §11).
 */
const AVAILABILITY_META: Record<
  IngredientAvailability,
  { label: string; Icon: typeof CheckIcon; className: string }
> = {
  have: { label: "In your fridge", Icon: CheckIcon, className: "text-primary" },
  unconfirmed: {
    label: "Not tracked — check",
    Icon: CircleHelpIcon,
    className: "text-warning-foreground",
  },
  missing: {
    label: "Missing",
    Icon: XIcon,
    className: "text-muted-foreground",
  },
};

export function availabilityLabel(availability: IngredientAvailability) {
  return AVAILABILITY_META[availability].label;
}

/**
 * Structured recipe part. Degrades gracefully: servings/notes/quantities are
 * optional, and empty ingredient/step arrays simply omit their section.
 * `matchedItemIds` are database ids and are deliberately never rendered.
 */
export function RecipeCard({
  recipe,
  onCookedThis,
  actionsDisabled = false,
}: {
  recipe: Recipe;
  /** Sends the "I cooked this" chat message; omit to render read-only. */
  onCookedThis?: () => void;
  actionsDisabled?: boolean;
}) {
  return (
    <article className="rounded-xl border bg-card">
      <header className="flex items-start gap-3 border-b px-4 py-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
          <CookingPotIcon className="size-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 dir="auto" className="text-base leading-snug font-semibold">
            {recipe.title}
          </h3>
          {recipe.servings !== null && recipe.servings > 0 ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Serves {recipe.servings}
            </p>
          ) : null}
        </div>
      </header>

      {recipe.ingredients.length > 0 ? (
        <section className="px-4 py-3">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Ingredients
          </h4>
          <ul className="mt-2 space-y-1.5">
            {recipe.ingredients.map((ingredient, index) => {
              const meta = AVAILABILITY_META[ingredient.availability];
              return (
                <li
                  key={`${ingredient.name}-${index}`}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="min-w-0">
                    <span dir="auto" className="font-medium break-words">
                      {ingredient.name}
                    </span>
                    {ingredient.quantity ? (
                      <span dir="auto" className="text-muted-foreground">
                        {" "}
                        · {ingredient.quantity}
                      </span>
                    ) : null}
                    {ingredient.optional ? (
                      <span className="text-muted-foreground"> (optional)</span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-1 text-xs",
                      meta.className,
                    )}
                  >
                    <meta.Icon className="size-3.5" aria-hidden="true" />
                    {meta.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {recipe.instructions.length > 0 ? (
        <section className="border-t px-4 py-3">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Steps
          </h4>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">
            {recipe.instructions.map((step, index) => (
              <li key={index} dir="auto" className="pl-1 break-words">
                {step}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {recipe.notes ? (
        <p
          dir="auto"
          className="border-t px-4 py-3 text-sm text-muted-foreground"
        >
          {recipe.notes}
        </p>
      ) : null}

      {onCookedThis ? (
        <footer className="border-t px-4 py-3">
          <Button
            variant="secondary"
            onClick={onCookedThis}
            disabled={actionsDisabled}
          >
            <CheckIcon className="size-4" aria-hidden="true" />
            {COOKED_THIS_MESSAGE}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            You&apos;ll review any fridge changes before they&apos;re applied.
          </p>
        </footer>
      ) : null}
    </article>
  );
}
