/**
 * Presentation helpers for item history — pure, deterministic (no locale
 * lookups), so the same strings render on any machine and in tests.
 *
 * History facts want absolute moments ("18 Aug 2026, 14:35"), unlike the
 * fridge list's compact relative times — a unit's story is read long after
 * the fact, when "3d ago" stops being useful. Same-day/previous-day moments
 * keep a friendly prefix ("Today, 17:10") per the details-sheet spec.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "18 Aug 2026" — calendar date only (lineage lines). */
export function historyDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "14:35" — 24-hour local clock. */
export function historyTime(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "Today, 17:10" / "Yesterday, 09:12" / "18 Aug 2026, 14:35". */
export function historyDateTime(iso: string, now: Date): string {
  const date = new Date(iso);
  const time = historyTime(iso);
  if (sameLocalDay(date, now)) return `Today, ${time}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameLocalDay(date, yesterday)) return `Yesterday, ${time}`;
  return `${historyDate(iso)}, ${time}`;
}
