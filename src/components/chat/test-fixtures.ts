/**
 * Frozen-contract fixtures for F4 chat UI tests. Ids are realistic UUIDs on
 * purpose: render tests assert that none of them ever reach the HTML.
 */

import type {
  AIActionProposal,
  AIConversationDetail,
  AIMessage,
  Recipe,
} from "@/lib/v2/types";

export const CONVERSATION_ID = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
export const ADD_PROPOSAL_ID = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
export const CONSUME_PROPOSAL_ID = "cccccccc-3333-4333-8333-cccccccccccc";
export const ITEM_ID_MILK = "dddddddd-4444-4444-8444-dddddddddddd";
export const ITEM_ID_EGGS = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee";
export const USER_ID = "ffffffff-6666-4666-8666-ffffffffffff";

let seq = 0;

export function userTextMessage(
  text: string,
  conversationId = CONVERSATION_ID,
): AIMessage {
  return {
    id: `99999999-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
    conversationId,
    role: "user",
    parts: [{ type: "text", text }],
    seq,
    createdAt: "2026-08-19T09:00:00.000Z",
  };
}

export function assistantTextMessage(
  text: string,
  conversationId = CONVERSATION_ID,
): AIMessage {
  return {
    id: `88888888-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
    conversationId,
    role: "assistant",
    parts: [{ type: "text", text }],
    seq,
    createdAt: "2026-08-19T09:00:01.000Z",
  };
}

/** Shakshuka with the three availability states and a Hebrew product name. */
export function recipeFixture(overrides: Partial<Recipe> = {}): Recipe {
  return {
    title: "Quick shakshuka",
    servings: 2,
    ingredients: [
      {
        name: "Eggs",
        quantity: "4",
        optional: false,
        matchedItemIds: [ITEM_ID_EGGS],
        availability: "have",
      },
      {
        name: "חלב טרי 3%",
        quantity: "100 ml",
        optional: true,
        matchedItemIds: [ITEM_ID_MILK],
        availability: "have",
      },
      {
        name: "Onion",
        quantity: "1",
        optional: false,
        matchedItemIds: [],
        availability: "unconfirmed",
      },
      {
        name: "Feta",
        quantity: null,
        optional: true,
        matchedItemIds: [],
        availability: "missing",
      },
    ],
    instructions: [
      "Soften the onion in a pan.",
      "Add crushed tomatoes and simmer.",
      "Crack in the eggs and cover until set.",
    ],
    notes: "Great with crusty bread.",
    ...overrides,
  };
}

export function pendingAddProposal(
  overrides: Partial<Extract<AIActionProposal, { kind: "add_item" }>> = {},
): Extract<AIActionProposal, { kind: "add_item" }> {
  return {
    id: ADD_PROPOSAL_ID,
    conversationId: CONVERSATION_ID,
    userId: USER_ID,
    kind: "add_item",
    payload: {
      name: "Onion",
      category: "Vegetables",
      units: 1,
      brand: "Local farm",
      packageSize: "1 kg",
    },
    status: "pending",
    createdAt: "2026-08-19T09:00:02.000Z",
    updatedAt: "2026-08-19T09:00:02.000Z",
    ...overrides,
  };
}

export function pendingConsumptionProposal(
  overrides: Partial<
    Extract<AIActionProposal, { kind: "consume_recipe" }>
  > = {},
): Extract<AIActionProposal, { kind: "consume_recipe" }> {
  return {
    id: CONSUME_PROPOSAL_ID,
    conversationId: CONVERSATION_ID,
    userId: USER_ID,
    kind: "consume_recipe",
    payload: {
      recipe: recipeFixture(),
      consumptions: [
        {
          itemId: ITEM_ID_MILK,
          productName: "חלב טרי 3%",
          fromPercent: 100,
          toPercent: 75,
        },
        {
          itemId: ITEM_ID_EGGS,
          productName: "Eggs",
          fromPercent: 75,
          toPercent: 50,
        },
      ],
    },
    status: "pending",
    createdAt: "2026-08-19T09:00:03.000Z",
    updatedAt: "2026-08-19T09:00:03.000Z",
    ...overrides,
  };
}

export function conversationDetail(
  overrides: Partial<AIConversationDetail> = {},
): AIConversationDetail {
  return {
    id: CONVERSATION_ID,
    title: "Quick dinner ideas",
    createdAt: "2026-08-19T08:59:00.000Z",
    updatedAt: "2026-08-19T09:00:03.000Z",
    messages: [
      userTextMessage("What can I make right now?"),
      assistantTextMessage("How about a quick shakshuka?"),
    ],
    proposals: [],
    ...overrides,
  };
}
