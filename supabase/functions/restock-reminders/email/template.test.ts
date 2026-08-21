import { describe, expect, it } from "vitest";

import {
  buildRestockReminderEmail,
  escapeHtml,
  RESTOCK_EMAIL_SUBJECT,
} from "./template.ts";

describe("buildRestockReminderEmail", () => {
  it("brands the message and links to APP_URL/restock (slash-normalized)", () => {
    const email = buildRestockReminderEmail({
      appUrl: "https://fridge.example/",
      lowNames: ["Milk"],
      finishedNames: [],
    });
    expect(email.subject).toBe(RESTOCK_EMAIL_SUBJECT);
    expect(email.html).toContain("Fridge Tracker");
    expect(email.html).toContain('href="https://fridge.example/restock"');
    expect(email.text).toContain("https://fridge.example/restock");
  });

  it("lists low and finished products in both html and text bodies", () => {
    const email = buildRestockReminderEmail({
      appUrl: "https://fridge.example",
      lowNames: ["Milk", "במבה"],
      finishedNames: ["Yogurt"],
    });
    expect(email.html).toContain("Running low");
    expect(email.html).toContain("Milk");
    expect(email.html).toContain("במבה");
    expect(email.html).toContain("Recently finished");
    expect(email.text).toContain("- במבה");
    expect(email.text).toContain("- Yogurt");
  });

  it("omits an empty section entirely", () => {
    const email = buildRestockReminderEmail({
      appUrl: "https://fridge.example",
      lowNames: ["Milk"],
      finishedNames: [],
    });
    expect(email.html).not.toContain("Recently finished");
    expect(email.text).not.toContain("Recently finished");
  });

  it("HTML-escapes product names (they are user data)", () => {
    const email = buildRestockReminderEmail({
      appUrl: "https://fridge.example",
      lowNames: ['<script>alert("x")</script>'],
      finishedNames: [],
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("caps long lists with an 'and N more' line", () => {
    const names = Array.from({ length: 11 }, (_, i) => `Item ${i + 1}`);
    const email = buildRestockReminderEmail({
      appUrl: "https://fridge.example",
      lowNames: names,
      finishedNames: [],
    });
    expect(email.html).toContain("and 3 more");
    expect(email.html).not.toContain("Item 9");
    expect(email.text).toContain("…and 3 more");
  });
});

describe("escapeHtml", () => {
  it("escapes the five significant characters", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;",
    );
  });
});
