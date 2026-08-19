import { MessageCircleIcon } from "@/components/icons";

import { COPY, STARTER_PROMPTS } from "./copy";

/**
 * Empty-conversation hero: tappable starter chips that send ordinary chat
 * messages — no dedicated endpoints. The page header carries the assistant
 * pitch and the composer footer carries the privacy note, so neither is
 * repeated here.
 */
export function StarterPrompts({
  onPick,
  disabled = false,
}: {
  onPick: (prompt: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-accent">
        <MessageCircleIcon className="size-8 text-primary" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-base font-semibold">{COPY.emptyTitle}</h2>
      <p className="mt-1 max-w-[38ch] text-sm text-muted-foreground">
        {COPY.emptyBody}
      </p>

      <ul className="mt-6 flex max-w-md flex-wrap justify-center gap-2">
        {STARTER_PROMPTS.map((prompt) => (
          <li key={prompt}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(prompt)}
              className="min-h-9 rounded-full border bg-card px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 motion-reduce:transition-none"
            >
              {prompt}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
