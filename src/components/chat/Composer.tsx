"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  LoaderCircleIcon,
  SendHorizontalIcon,
  XIcon,
} from "@/components/icons";
import { cn } from "@/components/ui/utils";
import { ROUTES } from "@/lib/routes";

import type { ComposerNotice } from "./chat-store";
import { COPY } from "./copy";

/** Mirrors aiChatRequestSchema: message max 4000 chars (frozen contract). */
export const MESSAGE_MAX_LENGTH = 4000;
const COUNTER_THRESHOLD = MESSAGE_MAX_LENGTH - 500;

/**
 * The chat composer: auto-growing multiline input inside a rounded card.
 * Enter sends on fine-pointer (desktop) devices, Shift+Enter inserts a
 * newline; on touch devices Enter is a newline and the send button sends —
 * the platform-native expectation. Empty/whitespace sends are blocked.
 *
 * The notice slot surfaces send failures whose message is NOT in the thread
 * (rate limit, network, validation): the draft stays in the input, so "Try
 * again" simply re-submits it — safe because those messages never persisted.
 */
export function Composer({
  value,
  onChange,
  onSend,
  busy,
  notice,
  onRetryNotice,
  onDismissNotice,
  textareaRef,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Submits the current draft (parent trims/validates again). */
  onSend: () => void;
  /** True while a turn is in flight — input stays editable, send disabled. */
  busy: boolean;
  notice: ComposerNotice | null;
  onRetryNotice: () => void;
  onDismissNotice: () => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  const assignRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (textareaRef) textareaRef.current = node;
    },
    [textareaRef],
  );

  // Auto-grow up to ~6 lines, then scroll internally.
  useEffect(() => {
    const textarea = innerRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [value]);

  const canSend = !busy && value.trim().length > 0;

  return (
    <div>
      {notice ? (
        <div
          role="alert"
          className="mb-2 flex items-start gap-2 rounded-xl border border-destructive/30 bg-card px-3.5 py-2.5 text-sm"
        >
          <p className="min-w-0 flex-1 text-destructive">{notice.message}</p>
          {notice.kind === "signed_out" ? (
            <a
              href={ROUTES.login}
              className="shrink-0 rounded-md px-2 py-0.5 font-medium text-primary outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              Log in
            </a>
          ) : notice.retryText ? (
            <button
              type="button"
              onClick={onRetryNotice}
              disabled={busy}
              className="shrink-0 rounded-md px-2 py-0.5 font-medium text-primary outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              Try again
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={onDismissNotice}
            className="-m-1 shrink-0 rounded-md p-1 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <XIcon className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <form
        className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-md"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) onSend();
        }}
      >
        <textarea
          ref={assignRef}
          dir="auto"
          rows={1}
          value={value}
          maxLength={MESSAGE_MAX_LENGTH}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends on fine-pointer devices only; on touch the primary
            // pointer is coarse and Enter stays a newline (checked lazily —
            // hybrids can change, e.g. detaching a tablet keyboard).
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              !window.matchMedia("(pointer: coarse)").matches
            ) {
              event.preventDefault();
              if (canSend) onSend();
            }
          }}
          aria-label={COPY.composerLabel}
          placeholder={COPY.composerPlaceholder}
          className="min-h-10 min-w-0 flex-1 resize-none self-center bg-transparent px-2 py-2 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={!canSend}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors duration-150 outline-none",
            "hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none",
          )}
        >
          {busy ? (
            <LoaderCircleIcon
              className="size-5 animate-spin"
              aria-hidden="true"
            />
          ) : (
            <SendHorizontalIcon className="size-5" aria-hidden="true" />
          )}
        </button>
      </form>

      <div className="mt-1.5 flex items-baseline justify-between gap-3 px-2">
        <p className="text-xs text-muted-foreground">{COPY.privacyNote}</p>
        {value.length >= COUNTER_THRESHOLD ? (
          <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {value.length}/{MESSAGE_MAX_LENGTH}
          </p>
        ) : null}
      </div>
    </div>
  );
}
