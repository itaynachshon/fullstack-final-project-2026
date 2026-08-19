import { describe, expect, it } from "vitest";

import {
  formatDaysOfWeek,
  formatDaysOfWeekLong,
  formatTimeZoneLabel,
} from "./format";

describe("formatDaysOfWeek", () => {
  it("names the two common presets", () => {
    expect(formatDaysOfWeek([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(formatDaysOfWeek([4, 0, 2, 1, 3])).toBe("Sun–Thu");
  });

  it("lists other selections Sunday-first", () => {
    expect(formatDaysOfWeek([4, 0])).toBe("Sun, Thu");
    expect(formatDaysOfWeek([6])).toBe("Sat");
  });
});

describe("formatDaysOfWeekLong", () => {
  it("reads naturally for screen readers", () => {
    expect(formatDaysOfWeekLong([0])).toBe("Sunday");
    expect(formatDaysOfWeekLong([4, 0, 2])).toBe(
      "Sunday, Tuesday and Thursday",
    );
  });
});

describe("formatTimeZoneLabel", () => {
  it("prefixes the zone with its current GMT offset", () => {
    // August: Israel is on IDT (+03).
    expect(
      formatTimeZoneLabel("Asia/Jerusalem", new Date("2026-08-18T12:00:00Z")),
    ).toBe("GMT+03:00 · Asia/Jerusalem");
    // January: IST (+02) — the label tracks DST.
    expect(
      formatTimeZoneLabel("Asia/Jerusalem", new Date("2026-01-18T12:00:00Z")),
    ).toBe("GMT+02:00 · Asia/Jerusalem");
  });

  it("falls back to the raw name for zones the runtime rejects", () => {
    expect(formatTimeZoneLabel("Not/A_Zone", new Date())).toBe("Not/A_Zone");
  });
});
