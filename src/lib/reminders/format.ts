/**
 * Presentation helpers for reminder schedules — pure functions, no I/O.
 * Weekday convention is frozen: 0 = Sunday … 6 = Saturday, and the week
 * renders Sunday-first (the Israeli week; also the JS getDay() order).
 */

import type { Weekday } from "@/lib/v2/types";

export const WEEKDAY_SHORT_LABELS: readonly string[] = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

export const WEEKDAY_FULL_LABELS: readonly string[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const EVERY_DAY: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];
/** Israeli working week. */
export const WORKWEEK_SUN_THU: readonly Weekday[] = [0, 1, 2, 3, 4];

function sameDays(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const sorted = [...a].sort((x, y) => x - y);
  return sorted.every((value, index) => value === b[index]);
}

/** "Every day", "Sun–Thu", or "Sun, Tue, Thu" — for schedule cards. */
export function formatDaysOfWeek(days: readonly number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sameDays(sorted, EVERY_DAY)) return "Every day";
  if (sameDays(sorted, WORKWEEK_SUN_THU)) return "Sun–Thu";
  return sorted.map((day) => WEEKDAY_SHORT_LABELS[day] ?? "?").join(", ");
}

/**
 * Accessible long form: "Sunday, Tuesday and Thursday" — screen-reader labels
 * should not have to pronounce "Sun, Tue, Thu".
 */
export function formatDaysOfWeekLong(days: readonly number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const names = sorted.map((day) => WEEKDAY_FULL_LABELS[day] ?? "unknown");
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * "GMT+03:00 · Asia/Jerusalem" — the offset is computed for the given moment
 * (so it tracks DST) via Intl; falls back to the bare zone name if the
 * runtime rejects the zone.
 */
export function formatTimeZoneLabel(timezone: string, at: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "longOffset",
    }).formatToParts(at);
    const offset = parts.find((part) => part.type === "timeZoneName")?.value;
    return offset ? `${offset} · ${timezone}` : timezone;
  } catch {
    return timezone;
  }
}
