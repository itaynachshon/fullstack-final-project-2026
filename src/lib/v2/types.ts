/**
 * V2 domain types — FROZEN CONTRACT (agent F0).
 *
 * Isolated from the Wave 1 frozen files (`src/lib/types.ts`, `src/lib/schemas.ts`)
 * so the deployed MVP does not drift. F1/F2/F3 import from `@/lib/v2` and must
 * NOT edit this file; shape changes require a coordinated commit.
 *
 * Source of truth: docs/FEATURES_V2_PLAN.md.
 */

import type {
  ActionError,
  Category,
  ConsumptionEvent,
  FridgeItem,
  Product,
  RemainingLevel,
} from "@/lib/types";

/* ─── Shared V2 action result ─────────────────────────────────────────────── */

export type V2ActionErrorCode =
  | ActionError["code"]
  | "not_implemented"
  | "conflict";

export interface V2ActionError {
  code: V2ActionErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

/**
 * Discriminated union returned by V2 server actions. Same shape as MVP
 * `ActionResult`, with extra error codes for stubs and accept conflicts.
 */
export type V2ActionResult<T> =
  { ok: true; data: T } | { ok: false; error: V2ActionError };

/* ─── Fridge lineage (extends frozen FridgeItem without mutating it) ─────── */

export type FridgeItemWithLineage = FridgeItem & {
  restockedFromItemId: string | null;
};

/** One derived history record for a physical unit (F1). */
export interface ItemHistory {
  itemId: string;
  product: Product;
  remainingPercent: RemainingLevel;
  /** `fridge_items.added_at` — not duplicated in a new column. */
  addedAt: string;
  /**
   * Latest consumption_events.created_at for this item with delta_percent > 0.
   * Null when the unit has never been consumed.
   */
  lastConsumedAt: string | null;
  /** `fridge_items.finished_at`. */
  finishedAt: string | null;
  /** This unit's source finished unit, if it was created by Restock. */
  restockedFromItemId: string | null;
  /** Live (or later) unit that restocked THIS finished unit, if any. */
  restockedByItemId: string | null;
  /** `added_at` of `restockedByItemId`. */
  restockedAt: string | null;
  timeline: ItemHistoryEvent[];
}

/** Timeline entry — the frozen ConsumptionEvent fields F1 actually renders. */
export type ItemHistoryEvent = Pick<
  ConsumptionEvent,
  "id" | "deltaPercent" | "remainingAfter" | "createdAt"
>;

export interface GetItemHistoryInput {
  itemId: string;
}

/* ─── Restock reminders (F2) ──────────────────────────────────────────────── */

/**
 * JavaScript `Date.getDay()` convention: 0 = Sunday … 6 = Saturday.
 * Frozen here so F2's scheduler and the CHECK constraint stay aligned.
 */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export interface RestockReminder {
  id: string;
  userId: string;
  daysOfWeek: Weekday[];
  /** 24-hour `HH:MM` in `timezone`. */
  localTime: string;
  /** IANA time zone, e.g. `Asia/Jerusalem`. */
  timezone: string;
  enabled: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  /** Scheduler idempotency key; never client-supplied. */
  lastSentKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRestockReminderInput {
  daysOfWeek: Weekday[];
  localTime: string;
  timezone: string;
  enabled: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
}

export interface UpdateRestockReminderInput {
  id: string;
  daysOfWeek?: Weekday[];
  localTime?: string;
  timezone?: string;
  enabled?: boolean;
  emailEnabled?: boolean;
  inAppEnabled?: boolean;
}

export interface DeleteRestockReminderInput {
  id: string;
}

export interface DeleteRestockReminderData {
  id: string;
}

/* ─── Notifications (F2) ──────────────────────────────────────────────────── */

export const NOTIFICATION_TYPES = ["restock_reminder", "ai_proposal"] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface ListNotificationsInput {
  unreadOnly?: boolean;
}

export interface MarkNotificationReadInput {
  id: string;
}

export interface MarkNotificationReadData {
  id: string;
  readAt: string;
}

/* ─── Recipes (F3, persisted inside message parts / proposal payloads) ───── */

export const INGREDIENT_AVAILABILITIES = [
  "have",
  "missing",
  "unconfirmed",
] as const;

export type IngredientAvailability = (typeof INGREDIENT_AVAILABILITIES)[number];

export interface RecipeIngredient {
  name: string;
  quantity: string | null;
  optional: boolean;
  /** Fridge unit ids that appear to match; empty when unknown. */
  matchedItemIds: string[];
  availability: IngredientAvailability;
}

export interface Recipe {
  title: string;
  servings: number | null;
  instructions: string[];
  ingredients: RecipeIngredient[];
  notes: string | null;
}

export interface ConsumptionProposal {
  itemId: string;
  productName: string;
  fromPercent: RemainingLevel;
  toPercent: RemainingLevel;
}

export interface AddItemProposalPayload {
  name: string;
  barcode?: string;
  brand?: string;
  packageSize?: string;
  category: Category;
  units: number;
}

export interface ConsumeRecipeProposalPayload {
  recipe: Recipe;
  consumptions: ConsumptionProposal[];
}

export const AI_ACTION_KINDS = ["add_item", "consume_recipe"] as const;

export type AIActionKind = (typeof AI_ACTION_KINDS)[number];

export const AI_ACTION_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "expired",
] as const;

export type AIActionStatus = (typeof AI_ACTION_STATUSES)[number];

export type AIActionProposal =
  | {
      id: string;
      conversationId: string;
      userId: string;
      kind: "add_item";
      payload: AddItemProposalPayload;
      status: AIActionStatus;
      createdAt: string;
      updatedAt: string;
    }
  | {
      id: string;
      conversationId: string;
      userId: string;
      kind: "consume_recipe";
      payload: ConsumeRecipeProposalPayload;
      status: AIActionStatus;
      createdAt: string;
      updatedAt: string;
    };

/* ─── Provider-neutral chat messages ──────────────────────────────────────── */

export const AI_MESSAGE_ROLES = ["user", "assistant", "system"] as const;

export type AIMessageRole = (typeof AI_MESSAGE_ROLES)[number];

export type AIMessagePart =
  | { type: "text"; text: string }
  | { type: "recipe"; recipe: Recipe }
  | {
      type: "missing_ingredient";
      ingredient: RecipeIngredient;
      question: string;
    }
  | { type: "action_proposal"; proposalId: string; kind: AIActionKind };

export interface AIMessage {
  id: string;
  conversationId: string;
  role: AIMessageRole;
  parts: AIMessagePart[];
  seq: number;
  createdAt: string;
}

export interface AIConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AIConversationDetail extends AIConversationSummary {
  messages: AIMessage[];
  proposals: AIActionProposal[];
}

export interface GetAIConversationInput {
  conversationId: string;
}

export interface AcceptAIProposalInput {
  proposalId: string;
}

export interface AcceptAIAddProposalData {
  proposalId: string;
  itemIds: string[];
}

export interface AcceptAIConsumptionProposalData {
  proposalId: string;
  itemIds: string[];
}

export interface RejectAIProposalData {
  proposalId: string;
  status: "rejected";
}

/* ─── HTTP: POST /api/ai/chat ─────────────────────────────────────────────── */

export interface AIChatRequest {
  /** Omit to start a new conversation. */
  conversationId?: string;
  message: string;
}

export type AIChatResponse =
  | {
      status: "ok";
      conversationId: string;
      message: AIMessage;
      proposals: AIActionProposal[];
    }
  | {
      status: "failed";
      conversationId: string;
      error: {
        code: "provider_unavailable" | "internal";
        message: string;
      };
    };

export type V2ApiErrorCode =
  | "invalid_request"
  | "unauthenticated"
  | "internal"
  | "not_implemented";

export interface V2ApiErrorBody {
  error: {
    code: V2ApiErrorCode;
    message: string;
  };
}

/* ─── Replaceable AI provider (F3 implements; F0 freezes the interface) ──── */

export interface AICompletionRequest {
  conversationId: string;
  messages: AIMessage[];
  /** Current user's live fridge, already mapped to domain types. */
  fridge: FridgeItemWithLineage[];
  userMessage: string;
}

export interface AICompletionResponse {
  parts: AIMessagePart[];
  title?: string;
  proposals?: Array<
    | { kind: "add_item"; payload: AddItemProposalPayload }
    | { kind: "consume_recipe"; payload: ConsumeRecipeProposalPayload }
  >;
}

/**
 * One vendor adapter. F3 registers an ordered list; the orchestrator tries
 * the next provider when `complete` throws or rejects (timeout, 5xx, parse).
 * Persistence stays provider-neutral: only `parts` are stored.
 */
export interface AIProvider {
  readonly id: string;
  readonly displayName: string;
  complete(
    request: AICompletionRequest,
    signal?: AbortSignal,
  ): Promise<AICompletionResponse>;
}
