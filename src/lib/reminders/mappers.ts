/**
 * Database-row → V2 domain mapping for restock reminders and notifications.
 * Pure functions, same defensive-but-silent posture as src/lib/fridge/mappers.ts
 * — the CHECK constraints in 20260818000000_v2_foundation.sql are the real
 * guarantee.
 */

import { NOTIFICATION_TYPES, WEEKDAYS } from "@/lib/v2/types";
import type {
  Notification,
  NotificationType,
  RestockReminder,
  Weekday,
} from "@/lib/v2/types";

/* ─── Row shapes (snake_case, as returned by PostgREST) ───────────────────── */

export interface RestockReminderRow {
  id: string;
  user_id: string;
  days_of_week: number[];
  /** Postgres `time` serializes as "HH:MM:SS". */
  local_time: string;
  timezone: string;
  enabled: boolean;
  email_enabled: boolean;
  in_app_enabled: boolean;
  last_sent_key: string | null;
  created_at: string;
  updated_at: string;
}

export const RESTOCK_REMINDER_SELECT =
  "id, user_id, days_of_week, local_time, timezone, enabled, email_enabled, in_app_enabled, last_sent_key, created_at, updated_at";

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  metadata: unknown;
  read_at: string | null;
  created_at: string;
}

export const NOTIFICATION_SELECT =
  "id, user_id, type, title, body, metadata, read_at, created_at";

/* ─── Mapping ─────────────────────────────────────────────────────────────── */

/** "09:00:00" → "09:00" (the UI/domain time format frozen in the contract). */
export function normalizeLocalTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

/** Keeps only valid 0–6 values, deduped, in Sunday-first display order. */
export function toWeekdays(values: readonly number[]): Weekday[] {
  const unique = [...new Set(values)].filter((value): value is Weekday =>
    (WEEKDAYS as readonly number[]).includes(value),
  );
  return unique.sort((a, b) => a - b);
}

export function mapReminderRow(row: RestockReminderRow): RestockReminder {
  return {
    id: row.id,
    userId: row.user_id,
    daysOfWeek: toWeekdays(row.days_of_week),
    localTime: normalizeLocalTime(row.local_time),
    timezone: row.timezone,
    enabled: row.enabled,
    emailEnabled: row.email_enabled,
    inAppEnabled: row.in_app_enabled,
    lastSentKey: row.last_sent_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toNotificationType(value: string): NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value)
    ? (value as NotificationType)
    : "restock_reminder";
}

function toMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function mapNotificationRow(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: toNotificationType(row.type),
    title: row.title,
    body: row.body,
    metadata: toMetadata(row.metadata),
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}
