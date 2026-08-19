import { describe, expect, it } from "vitest";

import { historyDate, historyDateTime, historyTime } from "./format";

// Dates are constructed from local components so expectations hold in any
// machine time zone (the formatters render the viewer's local clock).
const NOW = new Date(2026, 7, 18, 20, 0); // 18 Aug 2026, 20:00 local

function iso(...args: [number, number, number, number, number]): string {
  return new Date(...args).toISOString();
}

describe("historyDate", () => {
  it("renders '18 Aug 2026'", () => {
    expect(historyDate(iso(2026, 7, 18, 14, 35))).toBe("18 Aug 2026");
  });
});

describe("historyTime", () => {
  it("zero-pads a 24-hour clock", () => {
    expect(historyTime(iso(2026, 7, 18, 9, 5))).toBe("09:05");
    expect(historyTime(iso(2026, 7, 18, 23, 59))).toBe("23:59");
  });
});

describe("historyDateTime", () => {
  it("uses 'Today' for the same local day", () => {
    expect(historyDateTime(iso(2026, 7, 18, 17, 10), NOW)).toBe("Today, 17:10");
  });

  it("uses 'Yesterday' for the previous local day", () => {
    expect(historyDateTime(iso(2026, 7, 17, 9, 12), NOW)).toBe(
      "Yesterday, 09:12",
    );
  });

  it("handles a month boundary for 'Yesterday'", () => {
    const firstOfMonth = new Date(2026, 8, 1, 8, 0); // 1 Sep 2026
    expect(historyDateTime(iso(2026, 7, 31, 22, 45), firstOfMonth)).toBe(
      "Yesterday, 22:45",
    );
  });

  it("falls back to the absolute date for anything older", () => {
    expect(historyDateTime(iso(2026, 7, 15, 14, 35), NOW)).toBe(
      "15 Aug 2026, 14:35",
    );
  });
});
