/**
 * Pure occurrence math for restock reminder schedules — the heart of the F2
 * scheduler (docs/RESTOCK_REMINDERS.md §"Scheduling semantics").
 *
 * Platform-neutral by design: no Deno/Node/Next imports, only the Intl API,
 * so the exact same module runs inside the Supabase Edge runtime (Deno) and
 * under Vitest (Node). The runtime's IANA database is the source of truth
 * for time zones and DST.
 *
 * Weekday convention is frozen by F0: JS `Date.getDay()` — 0 = Sunday …
 * 6 = Saturday (src/lib/v2/types.ts WEEKDAYS).
 */

export interface ScheduleFields {
  /** Enabled weekdays, 0 = Sunday … 6 = Saturday. */
  daysOfWeek: readonly number[];
  /** "HH:MM" or "HH:MM:SS" (Postgres `time` serializes with seconds). */
  localTime: string;
  /** IANA zone name, e.g. "Asia/Jerusalem". */
  timezone: string;
}

export interface DueOccurrence {
  /**
   * Idempotency key for this scheduled occurrence:
   * `{yyyy-mm-dd}T{HH:MM}` in the reminder's own zone (the format F0
   * suggested for `restock_reminders.last_sent_key`). The local date makes
   * the key unique per occurrence; DST fall-back repeats a wall time but
   * not a (date, time) pair, so a key can never legitimately send twice.
   */
  key: string;
  /** The occurrence's real UTC instant (ms since epoch). */
  occurredAtMs: number;
}

/**
 * How far behind "now" an occurrence may be and still fire. Covers missed
 * scheduler ticks (deploys, pg_cron downtime) up to an hour; anything older
 * is treated as missed rather than delivered absurdly late.
 */
export const DEFAULT_CATCH_UP_WINDOW_MS = 60 * 60 * 1000;

interface WallClock {
  year: number;
  /** 1–12. */
  month: number;
  /** 1–31. */
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** One formatter per zone — Intl.DateTimeFormat construction is expensive. */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    // h23 avoids the "24:00" midnight formatting of h24 and the AM/PM
    // ambiguity of h12 — parts always parse to 00–23.
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

export function isValidTimeZone(timezone: string): boolean {
  if (!timezone) return false;
  try {
    formatterFor(timezone);
    return true;
  } catch {
    return false;
  }
}

/**
 * "08:30:00" / "08:30" / "8:30" → "08:30". Returns null for anything that
 * does not look like a wall-clock time (defense against hand-edited rows —
 * the Zod schema and the DB `time` type normally guarantee the shape).
 */
export function normalizeLocalTime(value: string): string | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** The wall clock readings in `timeZone` at the UTC instant `tsMs`. */
export function wallClockAt(tsMs: number, timeZone: string): WallClock {
  const parts = formatterFor(timeZone).formatToParts(new Date(tsMs));
  const read: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") read[part.type] = part.value;
  }
  return {
    year: Number(read.year),
    month: Number(read.month),
    day: Number(read.day),
    hour: Number(read.hour),
    minute: Number(read.minute),
    weekday: WEEKDAY_INDEX[read.weekday] ?? 0,
  };
}

/**
 * The UTC instant at which the wall clock in `timeZone` reads
 * `year-month-day hour:minute` — the inverse of `wallClockAt`, computed by
 * fixed-point iteration on the zone offset (two rounds converge for every
 * real offset; only DST-transition edge times need the notes below).
 *
 * DST edge behavior (deterministic, covered by tests):
 * - Nonexistent times (spring-forward gap, e.g. 02:30 on the night clocks
 *   jump 02:00→03:00) resolve to an instant within an hour of the intended
 *   wall time — the reminder still fires exactly once for that date.
 * - Ambiguous times (fall-back repeats an hour) resolve to one of the two
 *   instants; the occurrence key is date-based, so only one send happens.
 */
export function utcInstantForWallTime(
  date: { year: number; month: number; day: number },
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const asUtc = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  let ts = asUtc;
  for (let i = 0; i < 2; i += 1) {
    const wall = wallClockAt(ts, timeZone);
    const wallAsUtc = Date.UTC(
      wall.year,
      wall.month - 1,
      wall.day,
      wall.hour,
      wall.minute,
    );
    const offsetMs = wallAsUtc - ts;
    ts = asUtc - offsetMs;
  }
  return ts;
}

export function occurrenceKey(
  date: { year: number; month: number; day: number },
  localTime: string,
): string {
  const yyyy = String(date.year).padStart(4, "0");
  const mm = String(date.month).padStart(2, "0");
  const dd = String(date.day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${localTime}`;
}

/**
 * Candidate local dates that could host an occurrence inside the catch-up
 * window: sample the zone's wall clock at now, and 12/24/36 hours back, then
 * dedupe. Sampling every 12 h cannot skip a calendar date (local days are at
 * least 23 h long even across DST), and 36 h of reach comfortably covers the
 * maximum window plus any zone/DST offset.
 */
const CANDIDATE_SAMPLE_OFFSETS_MS = [
  0,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  36 * 60 * 60 * 1000,
];

/**
 * The most recent occurrence of `schedule` that is due at `nowMs`: it has
 * already happened, and it happened less than `windowMs` ago. Returns null
 * when nothing is due (including invalid time/zone data, which the caller
 * logs and skips rather than crashing the whole worker run).
 */
export function findDueOccurrence(
  schedule: ScheduleFields,
  nowMs: number,
  windowMs: number = DEFAULT_CATCH_UP_WINDOW_MS,
): DueOccurrence | null {
  if (!isValidTimeZone(schedule.timezone)) return null;
  const localTime = normalizeLocalTime(schedule.localTime);
  if (!localTime) return null;
  const [hour, minute] = localTime.split(":").map(Number);

  const seenDates = new Set<string>();
  let latest: DueOccurrence | null = null;

  for (const offset of CANDIDATE_SAMPLE_OFFSETS_MS) {
    const wall = wallClockAt(nowMs - offset, schedule.timezone);
    const dateId = `${wall.year}-${wall.month}-${wall.day}`;
    if (seenDates.has(dateId)) continue;
    seenDates.add(dateId);

    if (!schedule.daysOfWeek.includes(wall.weekday)) continue;

    const occurredAtMs = utcInstantForWallTime(
      wall,
      hour,
      minute,
      schedule.timezone,
    );
    if (occurredAtMs > nowMs) continue;
    if (nowMs - occurredAtMs >= windowMs) continue;

    if (!latest || occurredAtMs > latest.occurredAtMs) {
      latest = { key: occurrenceKey(wall, localTime), occurredAtMs };
    }
  }

  return latest;
}
