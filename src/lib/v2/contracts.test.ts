import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";

import {
  acceptAIProposalSchema,
  addItemProposalPayloadSchema,
  aiChatRequestSchema,
  consumeRecipeProposalPayloadSchema,
  createRestockReminderSchema,
  daysOfWeekSchema,
  deleteRestockReminderSchema,
  getAIConversationSchema,
  getItemHistorySchema,
  ianaTimeZoneSchema,
  listNotificationsSchema,
  localTimeSchema,
  markNotificationReadSchema,
  recipeSchema,
  updateRestockReminderSchema,
} from "@/lib/v2/schemas";
import type {
  AcceptAIProposalInput,
  AddItemProposalPayload,
  AIChatRequest,
  ConsumeRecipeProposalPayload,
  CreateRestockReminderInput,
  DeleteRestockReminderInput,
  GetAIConversationInput,
  GetItemHistoryInput,
  ListNotificationsInput,
  MarkNotificationReadInput,
  Recipe,
  UpdateRestockReminderInput,
} from "@/lib/v2/types";
import { V2_PROTECTED_PAGES, V2_ROUTES } from "@/lib/v2/routes";

const VALID_UUID = "8f14e45f-ceea-4f1b-8b13-2c5a0d1e9b42";

const MIGRATION_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../supabase/migrations/20260818000000_v2_foundation.sql",
);

describe("V2 getItemHistorySchema", () => {
  it("accepts a uuid", () => {
    expect(getItemHistorySchema.parse({ itemId: VALID_UUID })).toEqual({
      itemId: VALID_UUID,
    });
  });

  it("rejects a non-uuid", () => {
    expect(getItemHistorySchema.safeParse({ itemId: "nope" }).success).toBe(
      false,
    );
  });
});

describe("V2 restock reminder schemas", () => {
  const validCreate = {
    daysOfWeek: [0, 3] as const,
    localTime: "09:00",
    timezone: "Asia/Jerusalem",
    enabled: true,
    emailEnabled: true,
    inAppEnabled: false,
  };

  it("accepts unique weekdays 0–6 and a 24-hour local time", () => {
    expect(createRestockReminderSchema.parse(validCreate)).toMatchObject({
      localTime: "09:00",
      timezone: "Asia/Jerusalem",
    });
  });

  it.each([
    ["duplicate weekdays", { ...validCreate, daysOfWeek: [1, 1] }],
    ["weekday 7", { ...validCreate, daysOfWeek: [7] }],
    ["empty days", { ...validCreate, daysOfWeek: [] }],
    ["invalid time", { ...validCreate, localTime: "9:00" }],
    ["24:00", { ...validCreate, localTime: "24:00" }],
    ["bogus timezone", { ...validCreate, timezone: "Not/A_Zone" }],
    [
      "enabled with no channels",
      { ...validCreate, emailEnabled: false, inAppEnabled: false },
    ],
  ])("rejects %s", (_label, input) => {
    expect(createRestockReminderSchema.safeParse(input).success).toBe(false);
  });

  it("allows an enabled reminder to be disabled without channels", () => {
    expect(
      createRestockReminderSchema.safeParse({
        ...validCreate,
        enabled: false,
        emailEnabled: false,
        inAppEnabled: false,
      }).success,
    ).toBe(true);
  });

  it("accepts UTC as a time zone", () => {
    expect(ianaTimeZoneSchema.safeParse("UTC").success).toBe(true);
  });

  it("accepts the HH:MM boundaries 00:00 and 23:59", () => {
    expect(localTimeSchema.safeParse("00:00").success).toBe(true);
    expect(localTimeSchema.safeParse("23:59").success).toBe(true);
  });

  it("requires an id on update and ignores lastSentKey if smuggled", () => {
    const parsed = updateRestockReminderSchema.parse({
      id: VALID_UUID,
      enabled: false,
      lastSentKey: "forged",
    });
    expect(parsed).toEqual({ id: VALID_UUID, enabled: false });
    expect("lastSentKey" in parsed).toBe(false);
  });

  it("rejects enabling a reminder while sending both channels as false", () => {
    expect(
      updateRestockReminderSchema.safeParse({
        id: VALID_UUID,
        enabled: true,
        emailEnabled: false,
        inAppEnabled: false,
      }).success,
    ).toBe(false);
  });
});

describe("V2 notification schemas", () => {
  it("accepts an optional unreadOnly flag", () => {
    expect(listNotificationsSchema.parse({})).toEqual({});
    expect(listNotificationsSchema.parse({ unreadOnly: true })).toEqual({
      unreadOnly: true,
    });
  });

  it("requires a uuid to mark read", () => {
    expect(
      markNotificationReadSchema.safeParse({ id: VALID_UUID }).success,
    ).toBe(true);
    expect(markNotificationReadSchema.safeParse({ id: "x" }).success).toBe(
      false,
    );
  });
});

describe("V2 recipe and chat schemas", () => {
  const ingredient = {
    name: "Milk",
    quantity: "1 cup",
    optional: false,
    matchedItemIds: [VALID_UUID],
    availability: "have" as const,
  };

  const recipe: Recipe = {
    title: "Shakshuka",
    servings: 2,
    instructions: ["Heat oil.", "Simmer tomatoes."],
    ingredients: [ingredient],
    notes: null,
  };

  it("accepts a recipe with have/missing/unconfirmed ingredients", () => {
    expect(recipeSchema.parse(recipe).title).toBe("Shakshuka");
    expect(
      recipeSchema.safeParse({
        ...recipe,
        ingredients: [{ ...ingredient, availability: "maybe" }],
      }).success,
    ).toBe(false);
  });

  it("accepts add_item and consume_recipe payloads", () => {
    const addItem: AddItemProposalPayload = {
      name: "Labneh",
      category: "Dairy",
      units: 1,
    };
    expect(addItemProposalPayloadSchema.parse(addItem)).toEqual(addItem);

    const consume: ConsumeRecipeProposalPayload = {
      recipe,
      consumptions: [
        {
          itemId: VALID_UUID,
          productName: "Eggs",
          fromPercent: 100,
          toPercent: 50,
        },
      ],
    };
    expect(consumeRecipeProposalPayloadSchema.parse(consume)).toEqual(consume);
  });

  it("accepts a chat turn with or without a conversation id", () => {
    expect(aiChatRequestSchema.parse({ message: "What can I cook?" })).toEqual({
      message: "What can I cook?",
    });
    expect(
      aiChatRequestSchema.parse({
        conversationId: VALID_UUID,
        message: "I do have cumin.",
      }).conversationId,
    ).toBe(VALID_UUID);
  });

  it.each([
    ["empty message", { message: "   " }],
    ["oversized message", { message: "a".repeat(4001) }],
    ["bad conversation id", { conversationId: "nope", message: "hi" }],
  ])("rejects %s", (_label, input) => {
    expect(aiChatRequestSchema.safeParse(input).success).toBe(false);
  });
});

describe("V2 schema outputs match frozen input types", () => {
  it("stays aligned (compile-time assertions)", () => {
    expectTypeOf<
      z.output<typeof getItemHistorySchema>
    >().toEqualTypeOf<GetItemHistoryInput>();
    expectTypeOf<
      z.output<typeof createRestockReminderSchema>
    >().toEqualTypeOf<CreateRestockReminderInput>();
    expectTypeOf<
      z.output<typeof updateRestockReminderSchema>
    >().toEqualTypeOf<UpdateRestockReminderInput>();
    expectTypeOf<
      z.output<typeof deleteRestockReminderSchema>
    >().toEqualTypeOf<DeleteRestockReminderInput>();
    expectTypeOf<
      z.output<typeof listNotificationsSchema>
    >().toEqualTypeOf<ListNotificationsInput>();
    expectTypeOf<
      z.output<typeof markNotificationReadSchema>
    >().toEqualTypeOf<MarkNotificationReadInput>();
    expectTypeOf<
      z.output<typeof aiChatRequestSchema>
    >().toEqualTypeOf<AIChatRequest>();
    expectTypeOf<
      z.output<typeof getAIConversationSchema>
    >().toEqualTypeOf<GetAIConversationInput>();
    expectTypeOf<
      z.output<typeof acceptAIProposalSchema>
    >().toEqualTypeOf<AcceptAIProposalInput>();
    expectTypeOf<z.output<typeof recipeSchema>>().toEqualTypeOf<Recipe>();
    expectTypeOf<z.output<typeof daysOfWeekSchema>>().toEqualTypeOf<
      CreateRestockReminderInput["daysOfWeek"]
    >();
  });
});

// All V2 action stubs are now implemented, so the stub-expectation block is
// gone. Behavior is covered in the owning features' suites:
// - F1 history:       src/lib/v2/actions/history.test.ts
// - F2 reminders:     src/lib/v2/actions/reminders.test.ts
// - F2 notifications: src/lib/v2/actions/notifications.test.ts
// - F3 AI chat:       src/lib/v2/actions/ai.test.ts

describe("V2 routes", () => {
  it("freezes settings and chat paths", () => {
    expect(V2_ROUTES).toEqual({ settings: "/settings", chat: "/chat" });
    expect(V2_PROTECTED_PAGES).toEqual(["/settings", "/chat"]);
  });
});

describe("V2 foundation migration contract", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  it("adds lineage without rewriting historical migrations", () => {
    expect(sql).toContain("restocked_from_item_id");
    expect(sql).toContain("on delete set null");
    expect(sql).toContain("fridge_items_restocked_from_idx");
    expect(sql).not.toContain("drop table public.fridge_items");
    expect(sql).not.toMatch(/added_at\s+timestamptz/);
  });

  it("creates reminder, notification, and AI tables with RLS", () => {
    for (const table of [
      "restock_reminders",
      "notifications",
      "ai_conversations",
      "ai_messages",
      "ai_action_proposals",
    ]) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
  });

  it("validates weekdays 0–6 and keeps notifications unforgeable", () => {
    expect(sql).toContain("array[0, 1, 2, 3, 4, 5, 6]");
    expect(sql).toContain("grant update (read_at)");
    expect(sql).not.toMatch(
      /grant insert[\s\S]*on table public\.notifications\s+to authenticated/i,
    );
    expect(sql).toContain("grant update (status, updated_at)");
  });
});
