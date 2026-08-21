import { describe, expect, it } from "vitest";

import type { RestockSourceItem } from "./restock-items.ts";
import {
  runReminderWorker,
  type NotificationInsert,
  type ReminderRow,
  type WorkerDb,
  type WorkerDeps,
} from "./worker.ts";
import type {
  EmailSender,
  EmailSendResult,
  OutgoingEmail,
} from "../email/types.ts";

/* ─── Fixtures ─────────────────────────────────────────────────────────────── */

// Sunday 2026-08-23, 09:10 in Jerusalem (06:10 UTC) — ten minutes after a
// Sunday 09:00 Asia/Jerusalem schedule fired.
const NOW = Date.parse("2026-08-23T06:10:00Z");
const KEY = "2026-08-23T09:00";
const USER = "11111111-1111-4111-8111-111111111111";

function reminder(overrides: Partial<ReminderRow> = {}): ReminderRow {
  return {
    id: "r1",
    user_id: USER,
    days_of_week: [0],
    local_time: "09:00:00",
    timezone: "Asia/Jerusalem",
    enabled: true,
    email_enabled: false,
    in_app_enabled: true,
    last_sent_key: null,
    ...overrides,
  };
}

const LOW_MILK: RestockSourceItem = {
  productId: "p1",
  productName: "Milk",
  remainingPercent: 25,
  finishedAt: null,
};

const FINISHED_YOGURT: RestockSourceItem = {
  productId: "p2",
  productName: "Yogurt",
  remainingPercent: 0,
  finishedAt: new Date(NOW - 24 * 60 * 60 * 1000).toISOString(),
};

/**
 * In-memory WorkerDb with a REAL compare-and-set for claimOccurrence, so
 * retry/concurrency semantics behave like the PostgREST implementation.
 */
class FakeDb implements WorkerDb {
  reminders: ReminderRow[] = [];
  itemsByUser = new Map<string, RestockSourceItem[]>();
  emailsByUser = new Map<string, string | null>();
  notifications: NotificationInsert[] = [];
  claims: Array<{ reminderId: string; key: string }> = [];
  forcedClaimResults: boolean[] = [];
  failNotificationInsert = false;
  failFetchItemsForUsers = new Set<string>();

  async fetchEnabledReminders(): Promise<ReminderRow[]> {
    // Returns rows verbatim (including disabled ones) so the worker's own
    // enabled guard is exercisable.
    return this.reminders;
  }

  async claimOccurrence(reminderId: string, key: string): Promise<boolean> {
    this.claims.push({ reminderId, key });
    const forced = this.forcedClaimResults.shift();
    if (forced !== undefined) return forced;
    const row = this.reminders.find((entry) => entry.id === reminderId);
    if (!row || row.last_sent_key === key) return false;
    row.last_sent_key = key;
    return true;
  }

  async fetchRestockItems(userId: string): Promise<RestockSourceItem[]> {
    if (this.failFetchItemsForUsers.has(userId)) {
      throw new Error("fridge read failed");
    }
    return this.itemsByUser.get(userId) ?? [];
  }

  async fetchUserEmail(userId: string): Promise<string | null> {
    return this.emailsByUser.get(userId) ?? null;
  }

  async insertNotification(notification: NotificationInsert): Promise<void> {
    if (this.failNotificationInsert) throw new Error("insert denied");
    this.notifications.push(notification);
  }
}

class FakeEmail implements EmailSender {
  readonly id = "fake";
  sent: OutgoingEmail[] = [];
  result: EmailSendResult = { ok: true, providerMessageId: "msg-1" };

  async send(email: OutgoingEmail): Promise<EmailSendResult> {
    this.sent.push(email);
    return this.result;
  }
}

function setup(rows: ReminderRow[]) {
  const db = new FakeDb();
  db.reminders = rows;
  db.itemsByUser.set(USER, [LOW_MILK, FINISHED_YOGURT]);
  db.emailsByUser.set(USER, "user@example.com");
  const email = new FakeEmail();
  const deps: WorkerDeps = { db, email, appUrl: "https://fridge.example" };
  return { db, email, deps };
}

const run = (deps: WorkerDeps, options: { dryRun?: boolean } = {}) =>
  runReminderWorker(deps, { nowMs: NOW, dryRun: options.dryRun });

/* ─── Tests ────────────────────────────────────────────────────────────────── */

describe("runReminderWorker — delivery", () => {
  it("sends both channels, claims first, and stamps the occurrence metadata", async () => {
    const { db, email, deps } = setup([
      reminder({ email_enabled: true, in_app_enabled: true }),
    ]);

    const summary = await run(deps);

    expect(summary.outcomes).toEqual([
      expect.objectContaining({
        reminderId: "r1",
        status: "processed",
        occurrenceKey: KEY,
        inApp: "sent",
        email: "sent",
        lowCount: 1,
        finishedCount: 1,
      }),
    ]);
    expect(db.claims).toEqual([{ reminderId: "r1", key: KEY }]);

    expect(db.notifications).toHaveLength(1);
    const notification = db.notifications[0];
    expect(notification.userId).toBe(USER);
    expect(notification.title).toBe("Time to check what needs restocking");
    expect(notification.body).toContain("Running low: Milk.");
    expect(notification.body).toContain("Recently finished: Yogurt.");
    expect(notification.metadata).toEqual({
      reminder_id: "r1",
      occurrence_key: KEY,
      low_count: 1,
      finished_count: 1,
    });

    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].to).toBe("user@example.com");
    expect(email.sent[0].subject).toBe("Time to check what needs restocking");
    expect(email.sent[0].html).toContain("https://fridge.example/restock");
  });

  it("in-app only: never touches the email channel", async () => {
    const { db, email, deps } = setup([
      reminder({ in_app_enabled: true, email_enabled: false }),
    ]);
    const summary = await run(deps);
    expect(summary.outcomes[0]).toMatchObject({
      status: "processed",
      inApp: "sent",
      email: "off",
    });
    expect(email.sent).toHaveLength(0);
    expect(db.notifications).toHaveLength(1);
  });

  it("email only: never inserts a notification row", async () => {
    const { db, email, deps } = setup([
      reminder({ in_app_enabled: false, email_enabled: true }),
    ]);
    const summary = await run(deps);
    expect(summary.outcomes[0]).toMatchObject({
      status: "processed",
      inApp: "off",
      email: "sent",
    });
    expect(db.notifications).toHaveLength(0);
    expect(email.sent).toHaveLength(1);
  });

  it("delivers independently to multiple schedules of the same user", async () => {
    const second = reminder({
      id: "r2",
      local_time: "08:45:00", // also due at 09:10 with the 60-min window
    });
    const { db, deps } = setup([reminder(), second]);
    const summary = await run(deps);
    expect(summary.processed).toBe(2);
    expect(db.notifications).toHaveLength(2);
    expect(db.claims.map((claim) => claim.key)).toEqual([
      KEY,
      "2026-08-23T08:45",
    ]);
  });
});

describe("runReminderWorker — skipping", () => {
  it("skips reminders that are not due", async () => {
    const { db, deps } = setup([reminder({ local_time: "20:00:00" })]);
    const summary = await run(deps);
    expect(summary.outcomes[0].status).toBe("not_due");
    expect(db.claims).toHaveLength(0);
  });

  it("skips disabled reminders even if the query returned them", async () => {
    const { db, deps } = setup([reminder({ enabled: false })]);
    const summary = await run(deps);
    expect(summary.outcomes[0].status).toBe("disabled");
    expect(db.claims).toHaveLength(0);
    expect(db.notifications).toHaveLength(0);
  });

  it("skips an occurrence that was already sent (last_sent_key match)", async () => {
    const { db, deps } = setup([reminder({ last_sent_key: KEY })]);
    const summary = await run(deps);
    expect(summary.outcomes[0]).toMatchObject({
      status: "already_sent",
      occurrenceKey: KEY,
    });
    expect(db.claims).toHaveLength(0);
  });

  it("stops when a concurrent invocation wins the claim", async () => {
    const { db, email, deps } = setup([reminder({ email_enabled: true })]);
    db.forcedClaimResults = [false];
    const summary = await run(deps);
    expect(summary.outcomes[0].status).toBe("claimed_elsewhere");
    expect(db.notifications).toHaveLength(0);
    expect(email.sent).toHaveLength(0);
  });

  it("a full re-run (retry) sends nothing twice", async () => {
    const { db, deps } = setup([reminder()]);
    const first = await run(deps);
    expect(first.outcomes[0].status).toBe("processed");

    const second = await run(deps);
    expect(second.outcomes[0].status).toBe("already_sent");
    expect(db.notifications).toHaveLength(1);
  });

  it("consumes the occurrence but sends nothing when nothing needs restocking", async () => {
    const { db, email, deps } = setup([
      reminder({ email_enabled: true, in_app_enabled: true }),
    ]);
    db.itemsByUser.set(USER, [
      {
        productId: "p1",
        productName: "Milk",
        remainingPercent: 100,
        finishedAt: null,
      },
    ]);
    const summary = await run(deps);
    expect(summary.outcomes[0]).toMatchObject({
      status: "nothing_to_restock",
      occurrenceKey: KEY,
      lowCount: 0,
      finishedCount: 0,
    });
    expect(db.claims).toHaveLength(1);
    expect(db.notifications).toHaveLength(0);
    expect(email.sent).toHaveLength(0);
  });

  it("skips rows with an invalid timezone without crashing the run", async () => {
    const { deps } = setup([
      reminder({ timezone: "Not/A_Zone" }),
      reminder({ id: "r2" }),
    ]);
    const summary = await run(deps);
    expect(summary.outcomes[0].status).toBe("invalid_schedule");
    expect(summary.outcomes[1].status).toBe("processed");
  });
});

describe("runReminderWorker — channel isolation", () => {
  it("email provider failure does not block the in-app notification", async () => {
    const { db, email, deps } = setup([
      reminder({ email_enabled: true, in_app_enabled: true }),
    ]);
    email.result = {
      ok: false,
      retryable: true,
      status: 503,
      error: "brevo responded 503",
    };
    const summary = await run(deps);
    expect(summary.outcomes[0]).toMatchObject({
      status: "processed",
      inApp: "sent",
      email: "failed",
    });
    expect(db.notifications).toHaveLength(1);
  });

  it("a notification insert failure does not block the email", async () => {
    const { db, email, deps } = setup([
      reminder({ email_enabled: true, in_app_enabled: true }),
    ]);
    db.failNotificationInsert = true;
    const summary = await run(deps);
    expect(summary.outcomes[0]).toMatchObject({
      status: "processed",
      inApp: "failed",
      email: "sent",
    });
    expect(email.sent).toHaveLength(1);
  });

  it("reports a missing account email without failing the reminder", async () => {
    const { db, deps } = setup([
      reminder({ email_enabled: true, in_app_enabled: true }),
    ]);
    db.emailsByUser.set(USER, null);
    const summary = await run(deps);
    expect(summary.outcomes[0]).toMatchObject({
      status: "processed",
      inApp: "sent",
      email: "no_address",
    });
  });

  it("isolates one reminder's crash from the rest of the batch", async () => {
    const otherUser = "22222222-2222-4222-8222-222222222222";
    const { db, deps } = setup([
      reminder(),
      reminder({ id: "r2", user_id: otherUser }),
    ]);
    db.itemsByUser.set(otherUser, [LOW_MILK]);
    db.failFetchItemsForUsers.add(USER);

    const summary = await run(deps);
    expect(summary.outcomes[0].status).toBe("error");
    expect(summary.outcomes[1].status).toBe("processed");
  });
});

describe("runReminderWorker — dry run", () => {
  it("evaluates without claiming or sending", async () => {
    const { db, email, deps } = setup([
      reminder({ email_enabled: true, in_app_enabled: true }),
    ]);
    const summary = await run(deps, { dryRun: true });
    expect(summary.dryRun).toBe(true);
    expect(summary.outcomes[0]).toMatchObject({
      status: "would_send",
      occurrenceKey: KEY,
      lowCount: 1,
      finishedCount: 1,
    });
    expect(db.claims).toHaveLength(0);
    expect(db.notifications).toHaveLength(0);
    expect(email.sent).toHaveLength(0);
  });

  it("reports the empty-fridge skip decision", async () => {
    const { db, deps } = setup([reminder()]);
    db.itemsByUser.set(USER, []);
    const summary = await run(deps, { dryRun: true });
    expect(summary.outcomes[0].status).toBe("would_skip_empty");
  });
});
