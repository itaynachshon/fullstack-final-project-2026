import { describe, expect, it } from "vitest";

import {
  extractHistoryRecipeDrafts,
  renderPartForModel,
  toBoundedModelMessages,
} from "./messages";
import {
  EGGS_ITEM_ID,
  makeMessage,
  SHAKSHUKA_RECIPE,
  textMessage,
} from "./test-fixtures";

describe("extractHistoryRecipeDrafts", () => {
  it("collects recipes from assistant messages as ref-based drafts", () => {
    const messages = [
      textMessage("user", "shakshuka please"),
      makeMessage("assistant", [
        { type: "text", text: "Here you go" },
        { type: "recipe", recipe: SHAKSHUKA_RECIPE },
      ]),
    ];
    const drafts = extractHistoryRecipeDrafts(messages);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].title).toBe("Shakshuka");
    // Stored matchedItemIds are prior-turn database ids — they never enter
    // the provider layer. Availability survives; matches are dropped.
    expect(drafts[0].ingredients.map((i) => i.availability)).toEqual([
      "have",
      "have",
      "unconfirmed",
    ]);
    for (const ingredient of drafts[0].ingredients) {
      expect(ingredient.matchedItemRefs).toEqual([]);
    }
    expect(JSON.stringify(drafts)).not.toContain(EGGS_ITEM_ID);
  });

  it("ignores user messages and non-recipe parts", () => {
    expect(extractHistoryRecipeDrafts([textMessage("user", "hello")])).toEqual(
      [],
    );
  });
});

describe("renderPartForModel", () => {
  it("renders stored recipes without any database UUIDs", () => {
    const rendered = renderPartForModel({
      type: "recipe",
      recipe: SHAKSHUKA_RECIPE,
    });
    expect(rendered).toContain("Shakshuka");
    expect(rendered).toContain("Eggs");
    expect(rendered).toContain("have");
    expect(rendered).not.toContain(EGGS_ITEM_ID);
    expect(rendered).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it("renders questions and proposal markers compactly", () => {
    expect(
      renderPartForModel({
        type: "missing_ingredient",
        ingredient: {
          name: "Onion",
          quantity: null,
          optional: false,
          matchedItemIds: [],
          availability: "unconfirmed",
        },
        question: "Do you have onions?",
      }),
    ).toContain("Do you have onions?");

    const marker = renderPartForModel({
      type: "action_proposal",
      proposalId: "77777777-7777-4777-8777-777777777777",
      kind: "add_item",
    });
    expect(marker).toContain("confirmation");
    expect(marker).not.toContain("77777777");
  });
});

describe("toBoundedModelMessages", () => {
  it("keeps everything when within limits", () => {
    const messages = [
      textMessage("user", "hi"),
      textMessage("assistant", "hello"),
    ];
    const modelMessages = toBoundedModelMessages(messages);
    expect(modelMessages).toHaveLength(2);
    expect(modelMessages[0]).toEqual({ role: "user", content: "hi" });
  });

  it("drops the oldest messages and prepends an omission note", () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      textMessage(i % 2 === 0 ? "user" : "assistant", `message ${i}`),
    );
    const modelMessages = toBoundedModelMessages(messages, {
      maxMessages: 4,
      maxChars: 10_000,
    });
    expect(modelMessages).toHaveLength(5); // note + 4 newest
    expect(modelMessages[0].role).toBe("system");
    expect(String(modelMessages[0].content)).toContain("omitted");
    expect(modelMessages.at(-1)?.content).toBe("message 9");
  });

  it("respects the character budget but always keeps the newest message", () => {
    const messages = [
      textMessage("user", "a".repeat(400)),
      textMessage("assistant", "b".repeat(400)),
      textMessage("user", "c".repeat(400)),
    ];
    const bounded = toBoundedModelMessages(messages, {
      maxMessages: 30,
      maxChars: 500,
    });
    expect(bounded).toHaveLength(2); // note + newest
    expect(String(bounded.at(-1)?.content)).toContain("ccc");

    const huge = toBoundedModelMessages(
      [textMessage("user", "x".repeat(9_000))],
      {
        maxMessages: 30,
        maxChars: 500,
      },
    );
    expect(huge).toHaveLength(1);
  });
});
