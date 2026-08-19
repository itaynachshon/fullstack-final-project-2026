/**
 * Time-zone helpers for the reminder form. Pure and client-safe (no Next
 * imports) — the browser's Intl data is the source of both the default zone
 * and the picker list.
 */

/**
 * Used only when browser detection fails (ancient/misconfigured runtimes).
 * The project's primary audience is Israeli, so the graceful fallback is
 * Asia/Jerusalem — but every user's real zone is DETECTED first; nobody is
 * hard-coded to Israel.
 */
export const FALLBACK_TIME_ZONE = "Asia/Jerusalem";

/** Offered even when `Intl.supportedValuesOf` is unavailable. */
const CURATED_TIME_ZONES: readonly string[] = [
  "Asia/Jerusalem",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Athens",
  "Europe/Kyiv",
  "Europe/Moscow",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/** The browser's zone via Intl — the spec-mandated detection path. */
export function detectTimeZone(): string {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected && isValidTimeZone(detected)) return detected;
  } catch {
    // fall through to the fallback
  }
  return FALLBACK_TIME_ZONE;
}

export function isValidTimeZone(timezone: string): boolean {
  if (!timezone) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The picker list: the full IANA registry where the runtime exposes it,
 * otherwise a curated set — always including `extra` values (the detected
 * zone and any zone already saved on the reminder being edited).
 */
export function listTimeZones(extra: readonly string[] = []): string[] {
  const supported =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : CURATED_TIME_ZONES;

  const all = new Set<string>([
    ...supported,
    FALLBACK_TIME_ZONE,
    "UTC",
    ...extra.filter(isValidTimeZone),
  ]);
  return [...all].sort((a, b) => a.localeCompare(b));
}
