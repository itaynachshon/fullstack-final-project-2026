/**
 * Restock reminder email content — friendly Fridge Tracker branding, the
 * user's current low/finished products, and a single CTA to /restock.
 *
 * Product names are user data (and often Hebrew): they are HTML-escaped and
 * rendered with dir="auto" so RTL names display correctly. Nothing beyond the
 * recipient's own inventory appears in the message.
 */

import type { OutgoingEmail } from "./types.ts";

export interface RestockEmailInput {
  /** Public app origin, e.g. https://fridge-tracker.vercel.app */
  appUrl: string;
  lowNames: readonly string[];
  finishedNames: readonly string[];
}

/** Keep the message scannable; the app has the full list. */
const MAX_NAMES_PER_LIST = 8;

export const RESTOCK_EMAIL_SUBJECT = "Time to check what needs restocking";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function restockUrl(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}/restock`;
}

function capped(names: readonly string[]): {
  shown: readonly string[];
  more: number;
} {
  return {
    shown: names.slice(0, MAX_NAMES_PER_LIST),
    more: Math.max(0, names.length - MAX_NAMES_PER_LIST),
  };
}

function htmlList(names: readonly string[]): string {
  const { shown, more } = capped(names);
  const items = shown
    .map(
      (name) =>
        `<li style="margin:4px 0;"><span dir="auto">${escapeHtml(name)}</span></li>`,
    )
    .join("");
  const moreItem = more
    ? `<li style="margin:4px 0;color:#6b7280;">and ${more} more</li>`
    : "";
  return `<ul style="margin:8px 0 0;padding-left:20px;">${items}${moreItem}</ul>`;
}

function textList(names: readonly string[]): string {
  const { shown, more } = capped(names);
  const lines = shown.map((name) => `  - ${name}`);
  if (more) lines.push(`  …and ${more} more`);
  return lines.join("\n");
}

export function buildRestockReminderEmail(
  input: RestockEmailInput,
): Pick<OutgoingEmail, "subject" | "html" | "text"> {
  const url = restockUrl(input.appUrl);
  const hasLow = input.lowNames.length > 0;
  const hasFinished = input.finishedNames.length > 0;

  const sectionsHtml = [
    hasLow
      ? `<h3 style="margin:20px 0 0;font-size:15px;color:#111827;">Running low</h3>${htmlList(input.lowNames)}`
      : "",
    hasFinished
      ? `<h3 style="margin:20px 0 0;font-size:15px;color:#111827;">Recently finished</h3>${htmlList(input.finishedNames)}`
      : "",
  ].join("");

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f6f8;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
      <p style="margin:0;font-size:14px;font-weight:600;color:#2563eb;">Fridge Tracker</p>
      <h2 style="margin:12px 0 0;font-size:20px;">${RESTOCK_EMAIL_SUBJECT}</h2>
      <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#374151;">
        Here's what your fridge says before you head to the store:
      </p>
      ${sectionsHtml}
      <a href="${escapeHtml(url)}"
         style="display:inline-block;margin-top:24px;padding:12px 20px;border-radius:8px;background:#2563eb;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
        Open your restock list
      </a>
      <p style="margin:24px 0 0;font-size:12px;color:#6b7280;">
        You're getting this because you set a restock reminder in Fridge
        Tracker. You can edit or turn off reminders on the Restock page.
      </p>
    </div>
  </body>
</html>`;

  const textSections = [
    hasLow ? `Running low:\n${textList(input.lowNames)}` : "",
    hasFinished ? `Recently finished:\n${textList(input.finishedNames)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const text = [
    "Fridge Tracker",
    RESTOCK_EMAIL_SUBJECT,
    "",
    textSections,
    "",
    `Open your restock list: ${url}`,
    "",
    "You're getting this because you set a restock reminder in Fridge Tracker.",
  ].join("\n");

  return { subject: RESTOCK_EMAIL_SUBJECT, html, text };
}
