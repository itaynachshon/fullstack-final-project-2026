import { cn } from "@/components/ui/utils";
import type {
  AIActionProposal,
  AIMessage,
  AIMessagePart,
} from "@/lib/v2/types";

import { MissingIngredientCard } from "./MissingIngredientCard";
import { ProposalCard } from "./ProposalCard";
import { RecipeCard } from "./RecipeCard";

/**
 * One thread entry. User messages: compact right-aligned soft card.
 * Assistant messages: left-aligned, no bubble — text flows plainly and
 * structured parts (recipe / missing-ingredient / proposal) render as cards
 * (docs/UI_DESIGN.md: warm consumer surface, no giant colored bubbles).
 * Roles are also announced textually (sr-only) — never by style alone.
 */
export function ChatMessageItem({
  message,
  proposals,
  proposalNotices = {},
  busyProposal = null,
  onSendMessage,
  onAcceptProposal,
  onRejectProposal,
  actionsDisabled = false,
}: {
  message: AIMessage;
  proposals: Record<string, AIActionProposal>;
  proposalNotices?: Record<string, string>;
  busyProposal?: { id: string; action: "accept" | "reject" } | null;
  /** Quick replies / "I cooked this" — ordinary chat messages. */
  onSendMessage?: (text: string) => void;
  onAcceptProposal?: (proposal: AIActionProposal) => void;
  onRejectProposal?: (proposal: AIActionProposal) => void;
  actionsDisabled?: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <li
      className={cn("flex flex-col", isUser ? "items-end" : "items-start")}
      data-role={message.role}
    >
      <span className="sr-only">
        {isUser ? "You said:" : "Fridge Assistant said:"}
      </span>
      <div
        className={cn(
          "flex min-w-0 flex-col gap-3",
          isUser
            ? "max-w-[85%] rounded-2xl rounded-br-md bg-secondary px-3.5 py-2.5 md:max-w-[75%]"
            : "w-full max-w-full",
        )}
      >
        {message.parts.map((part, index) => (
          <MessagePart
            key={index}
            part={part}
            isUser={isUser}
            proposals={proposals}
            proposalNotices={proposalNotices}
            busyProposal={busyProposal}
            onSendMessage={onSendMessage}
            onAcceptProposal={onAcceptProposal}
            onRejectProposal={onRejectProposal}
            actionsDisabled={actionsDisabled}
          />
        ))}
      </div>
    </li>
  );
}

function MessagePart({
  part,
  isUser,
  proposals,
  proposalNotices,
  busyProposal,
  onSendMessage,
  onAcceptProposal,
  onRejectProposal,
  actionsDisabled,
}: {
  part: AIMessagePart;
  isUser: boolean;
  proposals: Record<string, AIActionProposal>;
  proposalNotices: Record<string, string>;
  busyProposal: { id: string; action: "accept" | "reject" } | null;
  onSendMessage?: (text: string) => void;
  onAcceptProposal?: (proposal: AIActionProposal) => void;
  onRejectProposal?: (proposal: AIActionProposal) => void;
  actionsDisabled: boolean;
}) {
  switch (part.type) {
    case "text":
      return (
        <p
          dir="auto"
          className={cn(
            "text-sm leading-relaxed break-words whitespace-pre-wrap",
            !isUser && "text-foreground",
          )}
        >
          {part.text}
        </p>
      );

    case "recipe":
      return (
        <RecipeCard
          recipe={part.recipe}
          onCookedThis={
            onSendMessage
              ? () => onSendMessage(cookedThisMessage(part.recipe.title))
              : undefined
          }
          actionsDisabled={actionsDisabled}
        />
      );

    case "missing_ingredient":
      return (
        <MissingIngredientCard
          ingredient={part.ingredient}
          question={part.question}
          onReply={onSendMessage}
          actionsDisabled={actionsDisabled}
        />
      );

    case "action_proposal": {
      const proposal = proposals[part.proposalId];
      if (!proposal) {
        // Degraded gracefully: the referenced proposal wasn't loaded.
        return (
          <p className="text-sm text-muted-foreground italic">
            This suggestion is no longer available.
          </p>
        );
      }
      return (
        <ProposalCard
          proposal={proposal}
          notice={proposalNotices[proposal.id]}
          busy={busyProposal?.id === proposal.id ? busyProposal.action : null}
          onAccept={
            onAcceptProposal ? () => onAcceptProposal(proposal) : undefined
          }
          onReject={
            onRejectProposal ? () => onRejectProposal(proposal) : undefined
          }
        />
      );
    }

    default:
      // Unknown future part kinds: render nothing rather than raw JSON.
      return null;
  }
}

/** "I cooked this" reply, naming the recipe so multi-recipe threads stay clear. */
export function cookedThisMessage(title: string): string {
  const trimmed = title.trim();
  return trimmed ? `I cooked this: ${trimmed}` : "I cooked this";
}
