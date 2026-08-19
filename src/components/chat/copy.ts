/**
 * User-facing copy for the Fridge Assistant (F4). One product persona: no
 * provider/vendor names ever appear here (docs/SECURITY.md §22 — the vendor
 * chain is invisible to users). Centralized so tests can assert the exact
 * strings without duplicating them.
 */

/** Starter prompt chips shown in an empty conversation. Normal chat messages. */
export const STARTER_PROMPTS = [
  "What can I make right now?",
  "I want something quick",
  "Something vegetarian",
  "Use things that are running low",
  "What can I make with my eggs?",
] as const;

/**
 * The retry turn message. After `provider_unavailable` the user's message is
 * ALREADY persisted (the orchestrator writes it before contacting providers),
 * and the route contract offers no "complete without a new message" call —
 * so re-POSTing the original text would duplicate it in the thread. Instead,
 * Retry sends this short follow-up as a normal user message: the model sees
 * the unanswered question in history and answers it.
 */
export const RETRY_TURN_MESSAGE = "Try again";

export const COPY = {
  pageTitle: "Fridge Assistant",
  pageSubtitle:
    "Tell me what you're in the mood for, and I'll work with what's in your fridge.",
  privacyNote:
    "The assistant uses your tracked fridge contents to make suggestions.",
  emptyTitle: "What are we cooking?",
  emptyBody: "Pick a starter below, or ask in your own words.",
  composerPlaceholder: "Ask what you can cook…",
  composerLabel: "Message the Fridge Assistant",
  thinking: "Thinking…",
  providerUnavailable: "The assistant is temporarily unavailable. Try again.",
  turnInternalError: "Something went wrong on our side. Try again.",
  rateLimited:
    "You're sending messages a little too quickly. Try again in a moment.",
  requestFailed: "Couldn't reach the assistant — check your connection.",
  signedOut: "You've been signed out. Log in to continue.",
  messageSaved: "Your message was saved.",
  addAccepted: "Added to your fridge.",
  consumptionAccepted: "Fridge updated.",
  proposalRejected: "Okay, not applied.",
  staleProposal:
    "Your fridge changed since this was suggested — ask the assistant for an updated proposal.",
} as const;

/** Quick replies under an assistant question about an untracked ingredient. */
export function missingIngredientReplies(name: string): {
  haveIt: string;
  dontHaveIt: string;
  substitute: string;
} {
  return {
    haveIt: `Yes, I have ${name}`,
    dontHaveIt: `I don't have ${name}`,
    substitute: `What could I use instead of ${name}?`,
  };
}

/** The "I cooked this" follow-up (sends a normal chat message). */
export const COOKED_THIS_MESSAGE = "I cooked this";
