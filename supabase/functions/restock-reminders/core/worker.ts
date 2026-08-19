/**
 * Reminder worker orchestration — pure logic over injected ports, so the
 * whole delivery pipeline is unit-testable without Deno, Postgres, or Brevo.
 *
 * Delivery guarantees (docs/RESTOCK_REMINDERS.md):
 * - AT-MOST-ONCE per scheduled occurrence. The worker atomically claims an
 *   occurrence by compare-and-setting `last_sent_key` BEFORE sending; a
 *   concurrent or retried invocation loses the claim and sends nothing, so
 *   duplicate notifications/emails are impossible.
 * - Channels are independent: an email failure never blocks the in-app
 *   notification (and vice versa). Both outcomes are recorded in the run
 *   summary and logs.
 * - "Nothing to restock" skips the send entirely (documented product
 *   decision: no noise when the fridge is fine) but still consumes the
 *   occurrence, so the decision is made once, at the scheduled time.
 */

import {
  DEFAULT_CATCH_UP_WINDOW_MS,
  findDueOccurrence,
  isValidTimeZone,
  normalizeLocalTime,
} from "./schedule.ts";
import {
  deriveRestockDigest,
  isRestockDigestEmpty,
  summarizeNames,
  type RestockDigest,
  type RestockSourceItem,
} from "./restock-items.ts";
import { buildRestockReminderEmail } from "../email/template.ts";
import type { EmailSender } from "../email/types.ts";

/* ─── Ports ────────────────────────────────────────────────────────────────── */

/** restock_reminders row, as stored (snake_case). */
export interface ReminderRow {
  id: string;
  user_id: string;
  days_of_week: number[];
  local_time: string;
  timezone: string;
  enabled: boolean;
  email_enabled: boolean;
  in_app_enabled: boolean;
  last_sent_key: string | null;
}

export interface NotificationInsert {
  userId: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}

export interface WorkerDb {
  fetchEnabledReminders(): Promise<ReminderRow[]>;
  /**
   * Atomic compare-and-set: writes `last_sent_key = key` only when the
   * current value differs (or is null) — one UPDATE statement, so exactly
   * one of any concurrent callers wins. Returns whether THIS call claimed.
   */
  claimOccurrence(reminderId: string, key: string): Promise<boolean>;
  fetchRestockItems(userId: string): Promise<RestockSourceItem[]>;
  /** Recipient identity comes from auth admin data — never from a client. */
  fetchUserEmail(userId: string): Promise<string | null>;
  insertNotification(notification: NotificationInsert): Promise<void>;
}

export interface WorkerDeps {
  db: WorkerDb;
  email: EmailSender;
  /** Public app origin for the email CTA. */
  appUrl: string;
  log?: (message: string) => void;
}

export interface WorkerOptions {
  nowMs: number;
  windowMs?: number;
  /** Evaluate and report without claiming or sending (local testing). */
  dryRun?: boolean;
}

/* ─── Outcomes ─────────────────────────────────────────────────────────────── */

export type ChannelOutcome = "sent" | "failed" | "off" | "no_address";

export type ReminderStatus =
  | "not_due"
  | "already_sent"
  | "claimed_elsewhere"
  | "nothing_to_restock"
  | "processed"
  | "would_send"
  | "would_skip_empty"
  | "disabled"
  | "invalid_schedule"
  | "error";

export interface ReminderOutcome {
  reminderId: string;
  userId: string;
  status: ReminderStatus;
  occurrenceKey?: string;
  inApp?: ChannelOutcome;
  email?: ChannelOutcome;
  lowCount?: number;
  finishedCount?: number;
  detail?: string;
}

export interface WorkerSummary {
  nowIso: string;
  windowMs: number;
  dryRun: boolean;
  reminders: number;
  processed: number;
  outcomes: ReminderOutcome[];
}

/* ─── Message content ──────────────────────────────────────────────────────── */

const NOTIFICATION_TITLE = "Time to check what needs restocking";
/** Keeps the body far inside the 2000-char DB CHECK even with long names. */
const MAX_NAMES_IN_NOTIFICATION = 6;

export function buildNotificationContent(digest: RestockDigest): {
  title: string;
  body: string;
} {
  const parts: string[] = [];
  if (digest.lowNames.length > 0) {
    parts.push(
      `Running low: ${summarizeNames(digest.lowNames, MAX_NAMES_IN_NOTIFICATION)}.`,
    );
  }
  if (digest.finishedNames.length > 0) {
    parts.push(
      `Recently finished: ${summarizeNames(digest.finishedNames, MAX_NAMES_IN_NOTIFICATION)}.`,
    );
  }
  parts.push("Open Restock to plan your shopping.");
  return { title: NOTIFICATION_TITLE, body: parts.join(" ") };
}

/* ─── The worker ───────────────────────────────────────────────────────────── */

export async function runReminderWorker(
  deps: WorkerDeps,
  options: WorkerOptions,
): Promise<WorkerSummary> {
  const log = deps.log ?? (() => {});
  const windowMs = options.windowMs ?? DEFAULT_CATCH_UP_WINDOW_MS;
  const dryRun = options.dryRun ?? false;
  const nowMs = options.nowMs;

  const reminders = await deps.db.fetchEnabledReminders();
  const outcomes: ReminderOutcome[] = [];

  for (const reminder of reminders) {
    try {
      outcomes.push(
        await processReminder(deps, reminder, nowMs, windowMs, dryRun),
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      log(`reminder ${reminder.id} failed: ${detail}`);
      outcomes.push({
        reminderId: reminder.id,
        userId: reminder.user_id,
        status: "error",
        detail,
      });
    }
  }

  return {
    nowIso: new Date(nowMs).toISOString(),
    windowMs,
    dryRun,
    reminders: reminders.length,
    processed: outcomes.filter((outcome) => outcome.status === "processed")
      .length,
    outcomes,
  };
}

async function processReminder(
  deps: WorkerDeps,
  reminder: ReminderRow,
  nowMs: number,
  windowMs: number,
  dryRun: boolean,
): Promise<ReminderOutcome> {
  const log = deps.log ?? (() => {});
  const base = { reminderId: reminder.id, userId: reminder.user_id };

  // The DB query already filters on enabled; keep a guard so a test double
  // (or a future query change) cannot accidentally deliver paused reminders.
  if (!reminder.enabled) return { ...base, status: "disabled" };

  if (
    !isValidTimeZone(reminder.timezone) ||
    normalizeLocalTime(reminder.local_time) === null
  ) {
    log(`reminder ${reminder.id} has an invalid timezone/time — skipped`);
    return { ...base, status: "invalid_schedule" };
  }

  const due = findDueOccurrence(
    {
      daysOfWeek: reminder.days_of_week,
      localTime: reminder.local_time,
      timezone: reminder.timezone,
    },
    nowMs,
    windowMs,
  );
  if (!due) return { ...base, status: "not_due" };
  if (reminder.last_sent_key === due.key) {
    return { ...base, status: "already_sent", occurrenceKey: due.key };
  }

  if (dryRun) {
    const digest = deriveRestockDigest(
      await deps.db.fetchRestockItems(reminder.user_id),
      nowMs,
    );
    return {
      ...base,
      status: isRestockDigestEmpty(digest) ? "would_skip_empty" : "would_send",
      occurrenceKey: due.key,
      inApp: reminder.in_app_enabled ? "sent" : "off",
      email: reminder.email_enabled ? "sent" : "off",
      lowCount: digest.lowNames.length,
      finishedCount: digest.finishedNames.length,
    };
  }

  // Claim BEFORE sending: at-most-once. A concurrent invocation (overlapping
  // cron tick, manual invoke, retry) loses this compare-and-set and stops.
  const claimed = await deps.db.claimOccurrence(reminder.id, due.key);
  if (!claimed) {
    return { ...base, status: "claimed_elsewhere", occurrenceKey: due.key };
  }

  const digest = deriveRestockDigest(
    await deps.db.fetchRestockItems(reminder.user_id),
    nowMs,
  );
  const counts = {
    lowCount: digest.lowNames.length,
    finishedCount: digest.finishedNames.length,
  };

  // Documented behavior: a fridge with nothing low/finished sends nothing —
  // the occurrence is consumed so the decision is not re-litigated each tick.
  if (isRestockDigestEmpty(digest)) {
    return {
      ...base,
      status: "nothing_to_restock",
      occurrenceKey: due.key,
      ...counts,
    };
  }

  let inApp: ChannelOutcome = "off";
  if (reminder.in_app_enabled) {
    try {
      const content = buildNotificationContent(digest);
      await deps.db.insertNotification({
        userId: reminder.user_id,
        title: content.title,
        body: content.body,
        metadata: {
          reminder_id: reminder.id,
          occurrence_key: due.key,
          low_count: counts.lowCount,
          finished_count: counts.finishedCount,
        },
      });
      inApp = "sent";
    } catch (error) {
      inApp = "failed";
      log(
        `reminder ${reminder.id}: in-app notification failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  let email: ChannelOutcome = "off";
  if (reminder.email_enabled) {
    email = await sendEmail(deps, reminder, digest, log);
  }

  return {
    ...base,
    status: "processed",
    occurrenceKey: due.key,
    inApp,
    email,
    ...counts,
  };
}

async function sendEmail(
  deps: WorkerDeps,
  reminder: ReminderRow,
  digest: RestockDigest,
  log: (message: string) => void,
): Promise<ChannelOutcome> {
  try {
    const to = await deps.db.fetchUserEmail(reminder.user_id);
    if (!to) {
      log(`reminder ${reminder.id}: user has no email address`);
      return "no_address";
    }
    const content = buildRestockReminderEmail({
      appUrl: deps.appUrl,
      lowNames: digest.lowNames,
      finishedNames: digest.finishedNames,
    });
    const result = await deps.email.send({ to, ...content });
    if (!result.ok) {
      log(`reminder ${reminder.id}: email failed: ${result.error}`);
      return "failed";
    }
    return "sent";
  } catch (error) {
    log(
      `reminder ${reminder.id}: email failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return "failed";
  }
}
