/**
 * V2 Zod boundaries — FROZEN CONTRACT (agent F0).
 *
 * Shared by V2 actions, the AI chat route, forms, and tests.
 * Client-side use is UX; server-side re-parsing is the security boundary.
 * `lastSentKey` is intentionally absent from every client-facing schema.
 */

import { z } from "zod";

import { CATEGORIES, REMAINING_LEVELS } from "@/lib/types";

import {
  AI_ACTION_KINDS,
  AI_MESSAGE_ROLES,
  INGREDIENT_AVAILABILITIES,
  WEEKDAYS,
} from "./types";

/* ─── F1 ──────────────────────────────────────────────────────────────────── */

export const getItemHistorySchema = z.object({
  itemId: z.uuid(),
});

/* ─── F2 reminders ────────────────────────────────────────────────────────── */

export const weekdaySchema = z.literal(WEEKDAYS);

export const daysOfWeekSchema = z
  .array(weekdaySchema)
  .min(1)
  .max(7)
  .refine((days) => new Set(days).size === days.length, {
    message: "Weekdays must be unique.",
  });

/** 24-hour clock, minutes precision. Matches the reminder UI contract. */
export const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM.");

/**
 * IANA names are validated via Intl (the runtime's tz database) rather than
 * a bundled list, so we do not add a dependency. `UTC` is accepted.
 */
export const ianaTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((timezone) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }, "Must be a valid IANA time zone.");

const reminderChannelsRefine = <
  T extends { enabled: boolean; emailEnabled: boolean; inAppEnabled: boolean },
>(
  value: T,
) => !value.enabled || value.emailEnabled || value.inAppEnabled;

export const createRestockReminderSchema = z
  .object({
    daysOfWeek: daysOfWeekSchema,
    localTime: localTimeSchema,
    timezone: ianaTimeZoneSchema,
    enabled: z.boolean(),
    emailEnabled: z.boolean(),
    inAppEnabled: z.boolean(),
  })
  .refine(reminderChannelsRefine, {
    message: "Enable email or in-app notifications when the reminder is on.",
  });

export const updateRestockReminderSchema = z
  .object({
    id: z.uuid(),
    daysOfWeek: daysOfWeekSchema.optional(),
    localTime: localTimeSchema.optional(),
    timezone: ianaTimeZoneSchema.optional(),
    enabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
    inAppEnabled: z.boolean().optional(),
  })
  .refine(
    (value) => {
      if (value.enabled !== true) return true;
      if (
        value.emailEnabled === undefined &&
        value.inAppEnabled === undefined
      ) {
        return true;
      }
      return value.emailEnabled === true || value.inAppEnabled === true;
    },
    {
      message: "Enable email or in-app notifications when the reminder is on.",
    },
  );

export const deleteRestockReminderSchema = z.object({
  id: z.uuid(),
});

export const listNotificationsSchema = z.object({
  unreadOnly: z.boolean().optional(),
});

export const markNotificationReadSchema = z.object({
  id: z.uuid(),
});

/* ─── F3 recipes + chat ───────────────────────────────────────────────────── */

export const remainingLevelSchema = z.literal(REMAINING_LEVELS);

export const recipeIngredientSchema = z.object({
  name: z.string().trim().min(1).max(80),
  quantity: z.string().trim().min(1).max(40).nullable(),
  optional: z.boolean(),
  matchedItemIds: z.array(z.uuid()).max(20),
  availability: z.literal(INGREDIENT_AVAILABILITIES),
});

export const recipeSchema = z.object({
  title: z.string().trim().min(1).max(120),
  servings: z.number().int().min(1).max(24).nullable(),
  instructions: z.array(z.string().trim().min(1).max(500)).min(1).max(40),
  ingredients: z.array(recipeIngredientSchema).min(1).max(40),
  notes: z.string().trim().min(1).max(500).nullable(),
});

export const consumptionProposalSchema = z.object({
  itemId: z.uuid(),
  productName: z.string().trim().min(1).max(120),
  fromPercent: remainingLevelSchema,
  toPercent: remainingLevelSchema,
});

export const addItemProposalPayloadSchema = z.object({
  name: z.string().trim().min(1).max(80),
  barcode: z.string().trim().min(1).max(20).optional(),
  brand: z.string().trim().min(1).max(60).optional(),
  packageSize: z.string().trim().min(1).max(30).optional(),
  category: z.enum(CATEGORIES),
  units: z.number().int().min(1).max(20),
});

export const consumeRecipeProposalPayloadSchema = z.object({
  recipe: recipeSchema,
  consumptions: z.array(consumptionProposalSchema).min(1).max(40),
});

export const aiMessagePartSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string().min(1).max(8000),
  }),
  z.object({
    type: z.literal("recipe"),
    recipe: recipeSchema,
  }),
  z.object({
    type: z.literal("missing_ingredient"),
    ingredient: recipeIngredientSchema,
    question: z.string().trim().min(1).max(300),
  }),
  z.object({
    type: z.literal("action_proposal"),
    proposalId: z.uuid(),
    kind: z.literal(AI_ACTION_KINDS),
  }),
]);

export const aiMessagePartsSchema = z.array(aiMessagePartSchema).min(1).max(32);

export const aiMessageRoleSchema = z.literal(AI_MESSAGE_ROLES);

export const aiChatRequestSchema = z.object({
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1).max(4000),
});

export const getAIConversationSchema = z.object({
  conversationId: z.uuid(),
});

export const acceptAIProposalSchema = z.object({
  proposalId: z.uuid(),
});

export const rejectAIProposalSchema = acceptAIProposalSchema;
