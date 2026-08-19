import { describe, expect, it } from "vitest";

import {
  extractHistoryRecipes,
  renderPartForModel,
  toBoundedModelMessages,
} from "./messages";
import { buildTurnInventory } from "./snapshot";
import {
  EGGS_ITEM_ID,
  makeFridge,
  makeMessage,
  SHAKSHUKA_RECIPE,
  textMessage,
} from "./test-fixtures";

const inventory = buildTurnInventory(makeFridge());

describe("extractHistoryRecipes", () => {
  it("collects recipe parts from assistant messages only", () => {
    const messages = [
      textMessage("user", "shakshuka please"),
      makeMessage("assistant", [
        { type: "text", text: "Here you go" },
        { type: "recipe", recipe: SHAKSHUKA_RECIPE },
      ]),
    ];
    const recipes = extractHistoryRecipes(messages);
    expect(recipes).toHaveLength(1);
    expect(recipes[0].title).toBe("Shakshuka");
  });
});

describe("renderPartForModel", () => {
  it("renders recipes with CURRENT turn refs instead of UUIDs", () => {
    const rendered = renderPartForModel(
      { type: "recipe", recipe: SHAKSHUKA_RECIPE },
      inventory,
    );
    expect(rendered).toContain("Shakshuka");
    expect(rendered).toContain("item_2"); // Eggs uuid → this turn's ref
    expect(rendered).not.toContain(EGGS_ITEM_ID);
    expect(rendered).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it("renders questions and proposal markers compactly", () => {
    expect(
      renderPartForModel(
        {
          type: "missing_ingredient",
          ingredient: {
            name: "Onion",
            quantity: null,
            optional: false,
            matchedItemIds: [],
            availability: "unconfirmed",
          },
          question: "Do you have onions?",
        },
        inventory,
      ),
    ).toContain("Do you have onions?");

    const marker = renderPartForModel(
      {
        type: "action_proposal",
        proposalId: "77777777-7777-4777-8777-777777777777",
        kind: "add_item",
      },
      inventory,
    );
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
    const modelMessages = toBoundedModelMessages(messages, inventory);
    expect(modelMessages).toHaveLength(2);
    expect(modelMessages[0]).toEqual({ role: "user", content: "hi" });
  });

  it("drops the oldest messages and prepends an omission note", () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      textMessage(i % 2 === 0 ? "user" : "assistant", `message ${i}`),
    );
    const modelMessages = toBoundedModelMessages(messages, inventory, {
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
    const bounded = toBoundedModelMessages(messages, inventory, {
      maxMessages: 30,
      maxChars: 500,
    });
    expect(bounded).toHaveLength(2); // note + newest
    expect(String(bounded.at(-1)?.content)).toContain("ccc");

    const huge = toBoundedModelMessages(
      [textMessage("user", "x".repeat(9_000))],
      inventory,
      { maxMessages: 30, maxChars: 500 },
    );
    expect(huge).toHaveLength(1);
  });
});
