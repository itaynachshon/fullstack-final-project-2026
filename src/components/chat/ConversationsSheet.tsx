"use client";

import {
  CheckIcon,
  LoaderCircleIcon,
  MessageCircleIcon,
  SquarePenIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/components/ui/utils";
import { relativeTime } from "@/lib/fridge/format";
import type { AIConversationSummary } from "@/lib/v2/types";

/**
 * Conversation history — a bottom sheet on phones, centered dialog from md
 * up (the app's one overlay pattern; no permanent sidebar, per the F4 brief).
 * Titles are model/user text → dir="auto". Ids stay in code, never in copy.
 */
export function ConversationsSheet({
  open,
  onClose,
  conversations,
  loading,
  activeConversationId,
  openingConversationId,
  onSelect,
  onNewChat,
}: {
  open: boolean;
  onClose: () => void;
  conversations: AIConversationSummary[];
  loading: boolean;
  activeConversationId: string | null;
  /** Set while a picked conversation is being fetched (spinner on that row). */
  openingConversationId: string | null;
  onSelect: (conversationId: string) => void;
  onNewChat: () => void;
}) {
  const now = new Date();

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="sheet"
      labelledBy="chat-conversations-title"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="chat-conversations-title" className="text-lg font-semibold">
          Conversations
        </h2>
        <Button variant="secondary" onClick={onNewChat}>
          <SquarePenIcon className="size-4" aria-hidden="true" />
          New chat
        </Button>
      </div>

      {loading && conversations.length === 0 ? (
        <div className="space-y-2 py-4" aria-hidden="true">
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-13 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-10 text-center">
          <MessageCircleIcon
            className="size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm text-muted-foreground">
            No conversations yet — ask your first question.
          </p>
        </div>
      ) : (
        <ul className="mt-3 space-y-1">
          {conversations.map((conversation) => {
            const active = conversation.id === activeConversationId;
            const opening = conversation.id === openingConversationId;
            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => onSelect(conversation.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex min-h-13 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition-colors duration-150 outline-none",
                    "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
                    active && "bg-accent",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      dir="auto"
                      className="block truncate text-sm font-medium"
                    >
                      {conversation.title || "New conversation"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {relativeTime(conversation.updatedAt, now)}
                    </span>
                  </span>
                  {opening ? (
                    <LoaderCircleIcon
                      className="size-4 shrink-0 animate-spin text-muted-foreground"
                      aria-hidden="true"
                    />
                  ) : active ? (
                    <CheckIcon
                      className="size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
