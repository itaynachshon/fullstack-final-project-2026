/**
 * Keyword → category mapper, shared by every code path that has to assign a
 * category to an external product name:
 *   - the seed pipeline (scripts/fetch-catalog.ts) — the statutory
 *     price-transparency schema contains NO category field, so a keyword
 *     mapping over the Hebrew item name is the only available signal;
 *   - the Open Food Facts cache write (src/lib/products/lookup.ts).
 *
 * This is a deliberate approximation (docs/TECHNICAL_DESIGN.md §3.1): rules
 * are checked in order, the first match wins, and anything unmatched falls
 * back to "Other". The user can always pick a category for manual products.
 *
 * Rule-order notes (load-bearing, do not shuffle casually):
 *   - Frozen first: "קפוא" on a schnitzel or vegetable bag beats every other
 *     signal.
 *   - Sauces & Spreads before Snacks so "ממרח שוקולד" (chocolate spread) is a
 *     spread while plain "שוקולד" remains a snack.
 *   - Snacks before Drinks so "שוקולד" (chocolate) never matches the shorter
 *     drink keyword "שוקו" (choco milk).
 *   - Drinks before Dairy so "משקה חלב" (milk drink) is a drink while
 *     "חלב טרי" stays dairy.
 *   - Prepared before Vegetables/Fruit so "סלט ירקות" / "מרק ירקות" land in
 *     Prepared.
 *   - "תפוח אדמה" (potato) is claimed by Vegetables, which runs before Fruit
 *     claims plain "תפוח" (apple).
 *
 * NOTE: this file is executed directly by Node via the seed scripts, so its
 * imports are type-only — no "@/" path alias and no runtime dependencies.
 */

import type { Category } from "../types";

/**
 * Hebrew has no \b word boundary in JavaScript regexes (Hebrew letters are
 * not \w), so short collision-prone keywords use an explicit
 * "not surrounded by Hebrew letters" boundary. Example collisions this
 * prevents: תה inside פיתה, מים inside לחמים, גיל inside רגיל, שמן inside
 * בשמן ("טונה בשמן" is tuna, not oil).
 */
function hebrewWord(word: string): RegExp {
  return new RegExp(`(^|[^\\u05d0-\\u05ea])${word}([^\\u05d0-\\u05ea]|$)`);
}

interface CategoryRule {
  category: Category;
  patterns: RegExp[];
}

const RULES: CategoryRule[] = [
  {
    category: "Frozen",
    patterns: [/קפוא/, /גליד/, /שלגון/, /ארטיק/, /frozen/i, /ice ?cream/i],
  },
  {
    category: "Sauces & Spreads",
    patterns: [
      /רוטב/,
      /קטשופ/,
      /מיונז/,
      /חרדל/,
      /טחינה/,
      /חומוס/,
      /ממרח/,
      /ריבה/,
      /דבש/,
      /סילאן/,
      /חומץ/,
      /תבלין/,
      hebrewWord("שמן"),
      /sauce/i,
      /ketchup/i,
      /mayo/i,
      /mustard/i,
      /tahini/i,
      /hummus/i,
      /spread/i,
      /jam/i,
      /honey/i,
    ],
  },
  {
    category: "Snacks",
    patterns: [
      /במבה/,
      /ביסלי/,
      /חטיף/,
      /שוקולד/,
      /וופל/,
      /ופל/,
      /עוגי/,
      /עוגה/,
      /ביסקוויט/,
      /קרקר/,
      /מציות/,
      /צ'?יפס/,
      /פופקורן/,
      /סוכרי/,
      /מסטיק/,
      /snack/i,
      /chips/i,
      /chocolate/i,
      /cookie/i,
      /wafer/i,
      /candy/i,
    ],
  },
  {
    category: "Drinks",
    patterns: [
      /משקה/,
      /מיץ/,
      /קולה/,
      /סודה/,
      /בירה/,
      /לימונדה/,
      /קפה/,
      /שוקו/,
      /מינרל/,
      hebrewWord("תה"),
      hebrewWord("יין"),
      hebrewWord("מים"),
      /juice/i,
      /cola/i,
      /beer/i,
      /wine/i,
      /coffee/i,
      /\btea\b/i,
      /water/i,
      /drink/i,
      /soda/i,
    ],
  },
  {
    category: "Dairy",
    patterns: [
      /חלב/,
      /גבינ/,
      /יוגורט/,
      /קוטג/,
      /שמנת/,
      /חמאה/,
      /מעדן/,
      /מילקי/,
      /ריקוטה/,
      /מוצרלה/,
      /קממבר/,
      /בולגרית/,
      /צפתית/,
      hebrewWord("לבן"),
      hebrewWord("אשל"),
      hebrewWord("גיל"),
      /milk/i,
      /cheese/i,
      /yog(h?)urt/i,
      /butter/i,
      /cream/i,
      /cottage/i,
    ],
  },
  {
    category: "Meat & Fish",
    patterns: [
      /עוף/,
      /הודו/,
      /בקר/,
      /בשר/,
      /נקניק/,
      /קבב/,
      /המבורגר/,
      /שניצל/,
      /סלמון/,
      /טונה/,
      /פילה/,
      /כבד/,
      /פסטרמה/,
      /דגים/,
      hebrewWord("דג"),
      /chicken/i,
      /beef/i,
      /turkey/i,
      /tuna/i,
      /salmon/i,
      /\bfish\b/i,
      /sausage/i,
    ],
  },
  {
    category: "Prepared",
    patterns: [
      /סלט/,
      /מרק/,
      /פיצה/,
      /בורקס/,
      /מלוואח/,
      /ג'חנון/,
      /קציצות/,
      /מוכן/,
      /pizza/i,
      /soup/i,
      /salad/i,
      /ready/i,
    ],
  },
  {
    category: "Vegetables",
    patterns: [
      /תפוח אדמה/,
      /תפו"א/,
      /עגבני/,
      /מלפפון/,
      /גזר/,
      /בצל/,
      /פלפל/,
      /חסה/,
      /כרוב/,
      /קישוא/,
      /חציל/,
      /תירס/,
      /ברוקולי/,
      /פטריות/,
      /ירקות/,
      /tomato/i,
      /cucumber/i,
      /carrot/i,
      /onion/i,
      /pepper/i,
      /vegetable/i,
    ],
  },
  {
    category: "Fruit",
    patterns: [
      /תפוח/,
      /בננה/,
      /תפוז/,
      /אבטיח/,
      /מלון/,
      /ענבים/,
      /אגס/,
      /אפרסק/,
      /שזיף/,
      /תות/,
      /מנגו/,
      /אננס/,
      /לימון/,
      /פירות/,
      /apple/i,
      /banana/i,
      /orange/i,
      /grape/i,
      /fruit/i,
    ],
  },
];

/**
 * Map a product name (plus optional brand text) to our fixed 10-value
 * category taxonomy. First matching rule wins; no match means "Other".
 */
export function mapCategory(name: string, brand?: string | null): Category {
  const text = brand ? `${name} ${brand}` : name;
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) return rule.category;
    }
  }
  return "Other";
}
