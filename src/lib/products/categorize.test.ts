import { describe, expect, it } from "vitest";

import { mapCategory } from "@/lib/products/categorize";

/**
 * The mapper is a documented approximation — these tests pin the rule
 * ordering (Frozen > Sauces > Snacks > Drinks > Dairy > …) and the Hebrew
 * word-boundary handling, using real Israeli product names from the research
 * reports where possible.
 */
describe("mapCategory", () => {
  it.each([
    // [product name, expected category]
    ["במבה", "Snacks"],
    ["ביסלי גריל", "Snacks"],
    ["שוקולד חלב מעולה", "Snacks"], // שוקולד beats חלב (rule order)
    ["Chocolate chip cookies", "Snacks"],
    ["קוטג' 5%", "Dairy"],
    ["חלב טרי 3% 1 ליטר", "Dairy"],
    ["שמנת מתוקה", "Dairy"], // שמנת must NOT match the bounded שמן keyword
    ["מילקי", "Dairy"],
    ["שוקו יטבתה", "Drinks"], // שוקו matches only when שוקולד did not
    ["מיץ תפוזים", "Drinks"], // מיץ beats תפוז (rule order)
    ["קפה טורקי עלית", "Drinks"],
    ["קוקה קולה 1.5 ליטר", "Drinks"],
    ["Coca-Cola Zero", "Drinks"],
    ["מים מינרליים", "Drinks"],
    ["רוטב עגבניות", "Sauces & Spreads"], // רוטב beats עגבני (rule order)
    ["חומוס אחלה", "Sauces & Spreads"],
    ["שמן זית כתית מעולה", "Sauces & Spreads"], // bounded שמן does match here
    ["ממרח שוקולד", "Sauces & Spreads"], // ממרח beats שוקולד (rule order)
    ["שניצל עוף קפוא", "Frozen"], // קפוא beats everything
    ["גולש עגל מעובד ארוז קפוא", "Frozen"],
    ["גלידת וניל", "Frozen"],
    ["חזה עוף טרי", "Meat & Fish"],
    ["טונה בשמן צמחי", "Meat & Fish"], // בשמן does not trigger the bounded שמן keyword
    ["נקניקיות הודו", "Meat & Fish"],
    ["מרק ירקות", "Prepared"], // מרק beats ירקות (rule order)
    ["סלט חצילים", "Prepared"],
    ["עגבניות שרי", "Vegetables"],
    ["תפוח אדמה אדום", "Vegetables"], // potato is claimed before Fruit sees תפוח
    ["תפוח פינק ליידי", "Fruit"],
    ["בננה", "Fruit"],
  ])("maps %s → %s", (name, category) => {
    expect(mapCategory(name)).toBe(category);
  });

  it.each([
    // Hebrew boundary handling: substrings must not fire inside longer words.
    ["פיתה כפרית", "Other"], // תה inside פיתה
    ["לחמים טריים", "Other"], // מים inside לחמים
    ["אורז רגיל", "Other"], // גיל inside רגיל
    // No signal at all.
    ["מוצר מסתורי", "Other"],
    ["אבקת כביסה", "Other"],
  ])("does not over-match: %s → %s", (name, category) => {
    expect(mapCategory(name)).toBe(category);
  });

  it("uses the brand text as a secondary signal", () => {
    expect(mapCategory("פינק ליידי", "פירות הגליל")).toBe("Fruit");
    expect(mapCategory("פינק ליידי", null)).toBe("Other");
    expect(mapCategory("פינק ליידי")).toBe("Other");
  });
});
