import { describe, expect, it } from "vitest";

import {
  findDueOccurrence,
  isValidTimeZone,
  normalizeLocalTime,
  occurrenceKey,
  utcInstantForWallTime,
  wallClockAt,
} from "./schedule.ts";

/**
 * Israel 2026 DST facts used below (IANA Asia/Jerusalem):
 * - Spring forward: Friday 2026-03-27, 02:00 → 03:00 (IST +02 → IDT +03).
 * - Fall back:      Sunday 2026-10-25, 02:00 → 01:00 (IDT +03 → IST +02).
 */

const HOUR = 60 * 60 * 1000;
const WINDOW = 60 * 60 * 1000;

const jerusalem = (days: number[], localTime: string) => ({
  daysOfWeek: days,
  localTime,
  timezone: "Asia/Jerusalem",
});

describe("normalizeLocalTime", () => {
  it("accepts Postgres time serializations and bare HH:MM", () => {
    expect(normalizeLocalTime("08:30:00")).toBe("08:30");
    expect(normalizeLocalTime("08:30:15.5")).toBe("08:30");
    expect(normalizeLocalTime("8:30")).toBe("08:30");
    expect(normalizeLocalTime("23:59")).toBe("23:59");
    expect(normalizeLocalTime("00:00")).toBe("00:00");
  });

  it("rejects non-times", () => {
    expect(normalizeLocalTime("24:00")).toBeNull();
    expect(normalizeLocalTime("12:60")).toBeNull();
    expect(normalizeLocalTime("noon")).toBeNull();
    expect(normalizeLocalTime("")).toBeNull();
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA names and UTC, rejects garbage", () => {
    expect(isValidTimeZone("Asia/Jerusalem")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Not/A_Zone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("wallClockAt", () => {
  it("reads the wall clock of a zone, including the JS weekday convention", () => {
    // 2026-08-18 is a Tuesday; Israel is on IDT (+03) in August.
    const wall = wallClockAt(
      Date.parse("2026-08-18T13:30:00Z"),
      "Asia/Jerusalem",
    );
    expect(wall).toEqual({
      year: 2026,
      month: 8,
      day: 18,
      hour: 16,
      minute: 30,
      weekday: 2,
    });
  });

  it("crosses midnight into the next local date", () => {
    // 21:30 UTC Tuesday = 00:30 Wednesday in Jerusalem (IDT).
    const wall = wallClockAt(
      Date.parse("2026-08-18T21:30:00Z"),
      "Asia/Jerusalem",
    );
    expect([wall.day, wall.hour, wall.weekday]).toEqual([19, 0, 3]);
  });
});

describe("utcInstantForWallTime", () => {
  it("inverts wallClockAt for ordinary times", () => {
    for (const timezone of ["Asia/Jerusalem", "America/New_York", "UTC"]) {
      const ts = Date.parse("2026-08-18T13:30:00Z");
      const wall = wallClockAt(ts, timezone);
      expect(
        utcInstantForWallTime(wall, wall.hour, wall.minute, timezone),
      ).toBe(ts);
    }
  });

  it("maps the same wall time to different instants across the DST switch", () => {
    const day = (d: number) => ({ year: 2026, month: 3, day: d });
    // 09:00 on 2026-03-26 (IST, +02) = 07:00 UTC.
    expect(utcInstantForWallTime(day(26), 9, 0, "Asia/Jerusalem")).toBe(
      Date.parse("2026-03-26T07:00:00Z"),
    );
    // 09:00 on 2026-03-28 (IDT, +03) = 06:00 UTC.
    expect(utcInstantForWallTime(day(28), 9, 0, "Asia/Jerusalem")).toBe(
      Date.parse("2026-03-28T06:00:00Z"),
    );
  });

  it("resolves a nonexistent spring-forward time within an hour, deterministically", () => {
    // 02:30 on 2026-03-27 does not exist in Israel (clocks jump 02:00→03:00).
    const target = { year: 2026, month: 3, day: 27 };
    const resolved = utcInstantForWallTime(target, 2, 30, "Asia/Jerusalem");
    const beforeGap = Date.parse("2026-03-26T23:30:00Z"); // 01:30 IST
    const afterGap = Date.parse("2026-03-27T00:30:00Z"); // 03:30 IDT
    expect([beforeGap, afterGap]).toContain(resolved);
    expect(utcInstantForWallTime(target, 2, 30, "Asia/Jerusalem")).toBe(
      resolved,
    );
  });

  it("resolves an ambiguous fall-back time to one of its two instants", () => {
    // 01:30 on 2026-10-25 happens twice (02:00 IDT falls back to 01:00 IST).
    const target = { year: 2026, month: 10, day: 25 };
    const resolved = utcInstantForWallTime(target, 1, 30, "Asia/Jerusalem");
    const firstPass = Date.parse("2026-10-24T22:30:00Z"); // 01:30 IDT
    const secondPass = Date.parse("2026-10-24T23:30:00Z"); // 01:30 IST
    expect([firstPass, secondPass]).toContain(resolved);
  });
});

describe("findDueOccurrence", () => {
  // 2026-08-23 is a Sunday. 09:00 IDT = 06:00 UTC.
  const sundayNine = jerusalem([0], "09:00:00");
  const occurredAt = Date.parse("2026-08-23T06:00:00Z");

  it("fires exactly at the scheduled instant", () => {
    const due = findDueOccurrence(sundayNine, occurredAt, WINDOW);
    expect(due).toEqual({ key: "2026-08-23T09:00", occurredAtMs: occurredAt });
  });

  it("fires within the catch-up window and reports the local-date key", () => {
    const due = findDueOccurrence(
      sundayNine,
      occurredAt + 25 * 60 * 1000,
      WINDOW,
    );
    expect(due?.key).toBe("2026-08-23T09:00");
    expect(due?.occurredAtMs).toBe(occurredAt);
  });

  it("does not fire before the scheduled time", () => {
    expect(
      findDueOccurrence(sundayNine, occurredAt - 60 * 1000, WINDOW),
    ).toBeNull();
  });

  it("treats an occurrence older than the window as missed", () => {
    expect(
      findDueOccurrence(sundayNine, occurredAt + WINDOW, WINDOW),
    ).toBeNull();
  });

  it("respects the weekday allow-list (0 = Sunday … 6 = Saturday)", () => {
    // Same instant, but the schedule only allows Monday (1).
    expect(
      findDueOccurrence(jerusalem([1], "09:00:00"), occurredAt, WINDOW),
    ).toBeNull();
    // Multiple days including Sunday fire normally.
    expect(
      findDueOccurrence(jerusalem([1, 0, 4], "09:00:00"), occurredAt, WINDOW),
    ).not.toBeNull();
  });

  it("evaluates the weekday in the reminder's zone, not UTC", () => {
    // 21:40 UTC Tuesday is already 00:40 WEDNESDAY in Jerusalem. A Wednesday
    // 00:15 schedule is due; its key carries the local (Wednesday) date.
    const due = findDueOccurrence(
      jerusalem([3], "00:15:00"),
      Date.parse("2026-08-18T21:40:00Z"),
      WINDOW,
    );
    expect(due?.key).toBe("2026-08-19T00:15");
    expect(due?.occurredAtMs).toBe(Date.parse("2026-08-18T21:15:00Z"));
  });

  it("stays on local time across the spring DST switch", () => {
    // Friday 2026-03-27 09:00 IDT (+03) = 06:00 UTC — the first morning on
    // summer time still fires at 09:00 on the user's clock.
    const due = findDueOccurrence(
      jerusalem([5], "09:00:00"),
      Date.parse("2026-03-27T06:20:00Z"),
      WINDOW,
    );
    expect(due?.key).toBe("2026-03-27T09:00");
    expect(due?.occurredAtMs).toBe(Date.parse("2026-03-27T06:00:00Z"));
  });

  it("stays on local time across the fall DST switch", () => {
    // Monday 2026-10-26 09:00 IST (+02) = 07:00 UTC.
    const due = findDueOccurrence(
      jerusalem([1], "09:00:00"),
      Date.parse("2026-10-26T07:30:00Z"),
      WINDOW,
    );
    expect(due?.key).toBe("2026-10-26T09:00");
    expect(due?.occurredAtMs).toBe(Date.parse("2026-10-26T07:00:00Z"));
  });

  it("produces one occurrence (one key) for an ambiguous fall-back time", () => {
    // Sunday 2026-10-25 01:30 exists twice; the key is date-based so the
    // occurrence can only ever be claimed once.
    const due = findDueOccurrence(
      jerusalem([0], "01:30:00"),
      Date.parse("2026-10-24T23:45:00Z"),
      2 * HOUR,
    );
    expect(due?.key).toBe("2026-10-25T01:30");
    expect([
      Date.parse("2026-10-24T22:30:00Z"),
      Date.parse("2026-10-24T23:30:00Z"),
    ]).toContain(due?.occurredAtMs);
  });

  it("fires once for a nonexistent spring-forward time", () => {
    const due = findDueOccurrence(
      jerusalem([5], "02:30:00"),
      Date.parse("2026-03-27T01:10:00Z"), // 04:10 IDT
      3 * HOUR,
    );
    expect(due?.key).toBe("2026-03-27T02:30");
  });

  it("supports negative-offset zones", () => {
    // 2026-08-23 is a Sunday; New York is on EDT (−04): 09:00 = 13:00 UTC.
    const due = findDueOccurrence(
      { daysOfWeek: [0], localTime: "09:00", timezone: "America/New_York" },
      Date.parse("2026-08-23T13:05:00Z"),
      WINDOW,
    );
    expect(due?.key).toBe("2026-08-23T09:00");
    expect(due?.occurredAtMs).toBe(Date.parse("2026-08-23T13:00:00Z"));
  });

  it("picks the most recent occurrence when a large window spans two days", () => {
    // Daily 23:50 schedule, checked at 00:10 — yesterday's occurrence is due.
    const due = findDueOccurrence(
      {
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        localTime: "23:50",
        timezone: "UTC",
      },
      Date.parse("2026-08-19T00:10:00Z"),
      WINDOW,
    );
    expect(due?.key).toBe("2026-08-18T23:50");
  });

  it("returns null for invalid zone or time data instead of throwing", () => {
    expect(
      findDueOccurrence(
        { daysOfWeek: [0], localTime: "09:00", timezone: "Not/A_Zone" },
        occurredAt,
        WINDOW,
      ),
    ).toBeNull();
    expect(
      findDueOccurrence(jerusalem([0], "25:00"), occurredAt, WINDOW),
    ).toBeNull();
  });
});

describe("occurrenceKey", () => {
  it("formats the frozen last_sent_key shape", () => {
    expect(occurrenceKey({ year: 2026, month: 8, day: 3 }, "09:05")).toBe(
      "2026-08-03T09:05",
    );
  });
});
