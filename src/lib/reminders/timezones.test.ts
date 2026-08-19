import { describe, expect, it } from "vitest";

import {
  detectTimeZone,
  FALLBACK_TIME_ZONE,
  isValidTimeZone,
  listTimeZones,
} from "./timezones";

describe("detectTimeZone", () => {
  it("returns a valid IANA zone from the runtime", () => {
    const detected = detectTimeZone();
    expect(isValidTimeZone(detected)).toBe(true);
  });
});

describe("listTimeZones", () => {
  it("always offers the fallback zone, UTC, and any extra zones", () => {
    const zones = listTimeZones(["Pacific/Galapagos"]);
    expect(zones).toContain(FALLBACK_TIME_ZONE);
    expect(zones).toContain("UTC");
    expect(zones).toContain("Pacific/Galapagos");
  });

  it("silently drops invalid extras and stays sorted", () => {
    const zones = listTimeZones(["Not/A_Zone"]);
    expect(zones).not.toContain("Not/A_Zone");
    expect(zones).toEqual([...zones].sort((a, b) => a.localeCompare(b)));
  });
});
