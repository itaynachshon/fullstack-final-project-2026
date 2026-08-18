/**
 * V2 public surface — FROZEN re-exports (agent F0).
 *
 * Feature agents import types/schemas from here. Action modules are imported
 * from `@/lib/v2/actions/...` so F1/F2/F3 can replace stub bodies without
 * touching this file.
 */

export type {
  AcceptAIAddProposalData,
  AcceptAIConsumptionProposalData,
  AcceptAIProposalInput,
  AddItemProposalPayload,
  AIActionKind,
  AIActionProposal,
  AIActionStatus,
  AIChatRequest,
  AIChatResponse,
  AICompletionRequest,
  AICompletionResponse,
  AIConversationDetail,
  AIConversationSummary,
  AIMessage,
  AIMessagePart,
  AIMessageRole,
  AIProvider,
  ConsumeRecipeProposalPayload,
  ConsumptionProposal,
  CreateRestockReminderInput,
  DeleteRestockReminderData,
  DeleteRestockReminderInput,
  FridgeItemWithLineage,
  GetAIConversationInput,
  GetItemHistoryInput,
  IngredientAvailability,
  ItemHistory,
  ItemHistoryEvent,
  ListNotificationsInput,
  MarkNotificationReadData,
  MarkNotificationReadInput,
  Notification,
  NotificationType,
  Recipe,
  RecipeIngredient,
  RejectAIProposalData,
  RestockReminder,
  UpdateRestockReminderInput,
  V2ActionError,
  V2ActionErrorCode,
  V2ActionResult,
  V2ApiErrorBody,
  V2ApiErrorCode,
  Weekday,
} from "./types";

export {
  AI_ACTION_KINDS,
  AI_ACTION_STATUSES,
  AI_MESSAGE_ROLES,
  INGREDIENT_AVAILABILITIES,
  NOTIFICATION_TYPES,
  WEEKDAYS,
} from "./types";

export {
  acceptAIProposalSchema,
  addItemProposalPayloadSchema,
  aiChatRequestSchema,
  aiMessagePartSchema,
  aiMessagePartsSchema,
  aiMessageRoleSchema,
  consumeRecipeProposalPayloadSchema,
  consumptionProposalSchema,
  createRestockReminderSchema,
  daysOfWeekSchema,
  deleteRestockReminderSchema,
  getAIConversationSchema,
  getItemHistorySchema,
  ianaTimeZoneSchema,
  listNotificationsSchema,
  localTimeSchema,
  markNotificationReadSchema,
  recipeIngredientSchema,
  recipeSchema,
  rejectAIProposalSchema,
  remainingLevelSchema,
  updateRestockReminderSchema,
  weekdaySchema,
} from "./schemas";

export { V2_API_ROUTES, V2_PROTECTED_PAGES, V2_ROUTES } from "./routes";
export type { V2AppRoute } from "./routes";
