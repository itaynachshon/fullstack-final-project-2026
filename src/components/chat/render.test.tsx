/**
 * Static render tests (renderToStaticMarkup — the repo deliberately has no
 * DOM testing library; interactive behavior is covered by the controller and
 * store suites, plus Playwright). Assertions target rendered text and
 * semantic attributes, never Tailwind class strings.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChatMessageItem, cookedThisMessage } from "./ChatMessage";
import { Composer } from "./Composer";
import { COPY, STARTER_PROMPTS } from "./copy";
import { MissingIngredientCard } from "./MissingIngredientCard";
import { ProposalCard } from "./ProposalCard";
import { RecipeCard } from "./RecipeCard";
import { StarterPrompts } from "./StarterPrompts";
import {
  ADD_PROPOSAL_ID,
  assistantTextMessage,
  CONSUME_PROPOSAL_ID,
  CONVERSATION_ID,
  ITEM_ID_EGGS,
  ITEM_ID_MILK,
  pendingAddProposal,
  pendingConsumptionProposal,
  recipeFixture,
  USER_ID,
  userTextMessage,
} from "./test-fixtures";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const OPAQUE_REF_PATTERN = /item_\d/;

describe("RecipeCard", () => {
  const html = renderToStaticMarkup(
    <RecipeCard recipe={recipeFixture()} onCookedThis={() => {}} />,
  );

  it("shows title, servings, ingredients, steps and notes", () => {
    expect(html).toContain("Quick shakshuka");
    expect(html).toContain("Serves 2");
    expect(html).toContain("Eggs");
    expect(html).toContain("Soften the onion in a pan.");
    expect(html).toContain("Great with crusty bread.");
    expect(html).toContain("(optional)");
  });

  it("labels all three availability states with text, not color alone", () => {
    expect(html).toContain("In your fridge");
    expect(html).toContain("Not tracked — check");
    expect(html).toContain("Missing");
  });

  it("renders Hebrew ingredient names with dir=auto", () => {
    expect(html).toContain("חלב טרי 3%");
    expect(html).toContain('dir="auto"');
  });

  it("never leaks matched item ids", () => {
    expect(html).not.toMatch(UUID_PATTERN);
    expect(html).not.toMatch(OPAQUE_REF_PATTERN);
  });

  it("offers the cooked-this action only when wired", () => {
    expect(html).toContain("I cooked this");
    const readOnly = renderToStaticMarkup(
      <RecipeCard recipe={recipeFixture()} />,
    );
    expect(readOnly).not.toContain("I cooked this");
  });

  it("degrades gracefully without servings, notes, or ingredients", () => {
    const bare = renderToStaticMarkup(
      <RecipeCard
        recipe={recipeFixture({
          servings: null,
          notes: null,
          ingredients: [],
          instructions: [],
        })}
      />,
    );
    expect(bare).toContain("Quick shakshuka");
    expect(bare).not.toContain("Serves");
    expect(bare).not.toContain("Ingredients");
    expect(bare).not.toContain("Steps");
  });

  it("names the recipe in the cooked-this follow-up message", () => {
    expect(cookedThisMessage("Quick shakshuka")).toBe(
      "I cooked this: Quick shakshuka",
    );
    expect(cookedThisMessage("  ")).toBe("I cooked this");
  });
});

describe("MissingIngredientCard", () => {
  it("preserves the assistant's uncertainty question", () => {
    const html = renderToStaticMarkup(
      <MissingIngredientCard
        ingredient={{
          name: "Onion",
          quantity: "1",
          optional: false,
          matchedItemIds: [],
          availability: "unconfirmed",
        }}
        question="I don't see onions in your tracked fridge. Do you actually have some?"
        onReply={() => {}}
      />,
    );
    expect(html).toContain("Do you actually have some?");
    expect(html).toContain("Yes, I have it");
    expect(html).toContain("I don&#x27;t have it");
    expect(html).toContain("Suggest an alternative");
  });

  it("falls back to uncertainty language — never asserts the user lacks it", () => {
    const html = renderToStaticMarkup(
      <MissingIngredientCard
        ingredient={{
          name: "Onion",
          quantity: null,
          optional: false,
          matchedItemIds: [],
          availability: "unconfirmed",
        }}
        onReply={() => {}}
      />,
    );
    expect(html).toContain("in your tracked fridge");
    expect(html).not.toContain("You don&#x27;t have");
  });

  it("renders read-only without a reply handler", () => {
    const html = renderToStaticMarkup(
      <MissingIngredientCard
        ingredient={{
          name: "Onion",
          quantity: null,
          optional: false,
          matchedItemIds: [],
          availability: "unconfirmed",
        }}
      />,
    );
    expect(html).not.toContain("Yes, I have it");
  });
});

describe("ProposalCard — add_item", () => {
  it("shows the reviewable payload and explicit actions while pending", () => {
    const html = renderToStaticMarkup(
      <ProposalCard
        proposal={pendingAddProposal()}
        onAccept={() => {}}
        onReject={() => {}}
      />,
    );
    expect(html).toContain("Add to your fridge?");
    expect(html).toContain("Onion");
    expect(html).toContain("Vegetables");
    expect(html).toContain("Local farm");
    expect(html).toContain("1 kg");
    expect(html).toContain("1 unit");
    expect(html).toContain("Add to fridge</button>");
    expect(html).toContain("Not now</button>");
  });

  it("never renders proposal/user UUIDs", () => {
    const html = renderToStaticMarkup(
      <ProposalCard proposal={pendingAddProposal()} />,
    );
    expect(html).not.toContain(ADD_PROPOSAL_ID);
    expect(html).not.toContain(USER_ID);
    expect(html).not.toMatch(UUID_PATTERN);
  });

  it.each(["accepted", "rejected", "expired"] as const)(
    "renders %s proposals read-only",
    (status) => {
      const html = renderToStaticMarkup(
        <ProposalCard
          proposal={pendingAddProposal({ status })}
          onAccept={() => {}}
          onReject={() => {}}
        />,
      );
      // The header ("Add to your fridge?") and card aria-label survive —
      // the action BUTTONS must be gone on resolved cards.
      expect(html).not.toContain("Add to fridge</button>");
      expect(html).not.toContain("Not now</button>");
      expect(html).toContain(
        status === "accepted"
          ? "Applied"
          : status === "rejected"
            ? "Dismissed"
            : "Expired",
      );
    },
  );
});

describe("ProposalCard — consume_recipe", () => {
  const html = renderToStaticMarkup(
    <ProposalCard
      proposal={pendingConsumptionProposal()}
      onAccept={() => {}}
      onReject={() => {}}
    />,
  );

  it("shows each transition in fridge level vocabulary", () => {
    expect(html).toContain("Update your fridge?");
    expect(html).toContain("חלב טרי 3%");
    expect(html).toContain("Full");
    expect(html).toContain("¾");
    expect(html).toContain("½");
    expect(html).toContain("Eggs");
    expect(html).toContain("Update fridge");
  });

  it("never renders item UUIDs", () => {
    expect(html).not.toContain(ITEM_ID_MILK);
    expect(html).not.toContain(ITEM_ID_EGGS);
    expect(html).not.toMatch(UUID_PATTERN);
  });

  it("shows the stale-fridge notice when provided", () => {
    const withNotice = renderToStaticMarkup(
      <ProposalCard
        proposal={pendingConsumptionProposal()}
        notice="Your fridge changed since this was proposed — ask the assistant again."
      />,
    );
    expect(withNotice).toContain("Your fridge changed");
  });
});

describe("ChatMessageItem", () => {
  it("distinguishes user and assistant roles in text, not only style", () => {
    const user = renderToStaticMarkup(
      <ChatMessageItem
        message={userTextMessage("שלום, מה אפשר לבשל?")}
        proposals={{}}
      />,
    );
    const assistant = renderToStaticMarkup(
      <ChatMessageItem
        message={assistantTextMessage("Let me check your fridge.")}
        proposals={{}}
      />,
    );
    expect(user).toContain("You said:");
    expect(user).toContain('data-role="user"');
    expect(user).toContain("שלום, מה אפשר לבשל?");
    expect(user).toContain('dir="auto"');
    expect(assistant).toContain("Fridge Assistant said:");
    expect(assistant).toContain('data-role="assistant"');
  });

  it("degrades gracefully when a referenced proposal is missing", () => {
    const message = {
      ...assistantTextMessage("x"),
      parts: [
        {
          type: "action_proposal" as const,
          proposalId: CONSUME_PROPOSAL_ID,
          kind: "consume_recipe" as const,
        },
      ],
    };
    const html = renderToStaticMarkup(
      <ChatMessageItem message={message} proposals={{}} />,
    );
    expect(html).toContain("no longer available");
    expect(html).not.toContain(CONSUME_PROPOSAL_ID);
  });

  it("renders a full assistant turn without provider names or ids", () => {
    const message = {
      ...assistantTextMessage("Here's a plan."),
      parts: [
        { type: "text" as const, text: "Here's a plan." },
        { type: "recipe" as const, recipe: recipeFixture() },
        {
          type: "action_proposal" as const,
          proposalId: CONSUME_PROPOSAL_ID,
          kind: "consume_recipe" as const,
        },
      ],
    };
    const html = renderToStaticMarkup(
      <ChatMessageItem
        message={message}
        proposals={{
          [CONSUME_PROPOSAL_ID]: pendingConsumptionProposal(),
        }}
        onSendMessage={() => {}}
        onAcceptProposal={() => {}}
        onRejectProposal={() => {}}
      />,
    );
    for (const vendor of ["Gemini", "Groq", "gemini", "groq"]) {
      expect(html).not.toContain(vendor);
    }
    expect(html).not.toMatch(UUID_PATTERN);
    expect(html).not.toMatch(OPAQUE_REF_PATTERN);
    expect(html).not.toContain(CONVERSATION_ID);
  });
});

describe("StarterPrompts", () => {
  const html = renderToStaticMarkup(<StarterPrompts onPick={() => {}} />);

  it("offers every starter prompt as a button", () => {
    for (const prompt of STARTER_PROMPTS) {
      expect(html).toContain(prompt.replace(/'/g, "&#x27;"));
    }
  });
});

describe("Composer", () => {
  const html = renderToStaticMarkup(
    <Composer
      value=""
      onChange={() => {}}
      onSend={() => {}}
      busy={false}
      notice={null}
      onRetryNotice={() => {}}
      onDismissNotice={() => {}}
    />,
  );

  it("carries the discoverable privacy note and an accessible input", () => {
    expect(html).toContain(COPY.privacyNote);
    expect(html).toContain(`aria-label="${COPY.composerLabel}"`);
    expect(html).toContain('maxLength="4000"');
  });

  it("surfaces a retryable send failure as an alert", () => {
    const withNotice = renderToStaticMarkup(
      <Composer
        value=""
        onChange={() => {}}
        onSend={() => {}}
        busy={false}
        notice={{
          kind: "rate_limited",
          message: COPY.rateLimited,
          retryText: "hi",
        }}
        onRetryNotice={() => {}}
        onDismissNotice={() => {}}
      />,
    );
    expect(withNotice).toContain('role="alert"');
    expect(withNotice).toContain(COPY.rateLimited.replace(/'/g, "&#x27;"));
    expect(withNotice).toContain("Try again");
  });
});
