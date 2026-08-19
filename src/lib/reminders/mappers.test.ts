import { describe, expect, it } from "vitest";

import {
  mapNotificationRow,
  mapReminderRow,
  normalizeLocalTime,
  toWeekdays,
  type NotificationRow,
  type RestockReminderRow,
} from "./mappers";

const REMINDER_ROW: RestockReminderRow = {
  id: "8f14e45f-ceea-4f1b-8b13-2c5a0d1e9b42",
  user_id: "11111111-1111-4111-8111-111111111111",
  days_of_week: [3, 0],
  local_time: "09:00:00",
  timezone: "Asia/Jerusalem",
  enabled: true,
  email_enabled: false,
  in_app_enabled: true,
  last_sent_key: "2026-08-16T09:00",
  created_at: "2026-08-10T10:00:00Z",
  updated_at: "2026-08-16T09:00:00Z",
};

describe("mapReminderRow", () => {
  it("camel-cases, trims seconds off the time, and sorts weekdays", () => {
    expect(mapReminderRow(REMINDER_ROW)).toEqual({
      id: REMINDER_ROW.id,
      userId: REMINDER_ROW.user_id,
      daysOfWeek: [0, 3],
      localTime: "09:00",
      timezone: "Asia/Jerusalem",
      enabled: true,
      emailEnabled: false,
      inAppEnabled: true,
      lastSentKey: "2026-08-16T09:00",
      createdAt: REMINDER_ROW.created_at,
      updatedAt: REMINDER_ROW.updated_at,
    });
  });
});

describe("normalizeLocalTime", () => {
  it("normalizes Postgres time serializations", () => {
    expect(normalizeLocalTime("09:00:00")).toBe("09:00");
    expect(normalizeLocalTime("9:05")).toBe("09:05");
    expect(normalizeLocalTime("23:59:59")).toBe("23:59");
  });
});

describe("toWeekdays", () => {
  it("dedupes, drops out-of-range values, and sorts Sunday-first", () => {
    expect(toWeekdays([6, 0, 6, 9, -1, 3])).toEqual([0, 3, 6]);
  });
});

describe("mapNotificationRow", () => {
  const row: NotificationRow = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    user_id: "11111111-1111-4111-8111-111111111111",
    type: "restock_reminder",
    title: "Time to check what needs restocking",
    body: "Running low: Milk.",
    metadata: { reminder_id: "r1", occurrence_key: "2026-08-23T09:00" },
    read_at: null,
    created_at: "2026-08-23T06:10:00Z",
  };

  it("maps rows and keeps object metadata", () => {
    expect(mapNotificationRow(row)).toEqual({
      id: row.id,
      userId: row.user_id,
      type: "restock_reminder",
      title: row.title,
      body: row.body,
      metadata: { reminder_id: "r1", occurrence_key: "2026-08-23T09:00" },
      readAt: null,
      createdAt: row.created_at,
    });
  });

  it("defends against non-object metadata and unknown types", () => {
    const mapped = mapNotificationRow({
      ...row,
      type: "surprise",
      metadata: [1, 2],
    });
    expect(mapped.type).toBe("restock_reminder");
    expect(mapped.metadata).toEqual({});
  });
});
