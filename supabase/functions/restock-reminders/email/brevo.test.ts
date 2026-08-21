import { describe, expect, it } from "vitest";

import { BREVO_ENDPOINT, BrevoEmailSender } from "./brevo.ts";
import type { OutgoingEmail } from "./types.ts";

const EMAIL: OutgoingEmail = {
  to: "user@example.com",
  subject: "Time to check what needs restocking",
  html: "<p>hi</p>",
  text: "hi",
};

type Scripted = Response | Error;

function scriptedFetch(script: Scripted[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchFn: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = script.shift();
    if (!next) throw new Error("scripted fetch exhausted");
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, fetchFn };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

function sender(fetchFn: typeof fetch) {
  return new BrevoEmailSender({
    apiKey: "test-key",
    fromEmail: "reminders@fridge.example",
    fetchFn,
    retryDelayMs: 0,
  });
}

describe("BrevoEmailSender", () => {
  it("POSTs the transactional payload with the api-key header", async () => {
    const { calls, fetchFn } = scriptedFetch([
      json(201, { messageId: "<msg-123>" }),
    ]);

    const result = await sender(fetchFn).send(EMAIL);

    expect(result).toEqual({ ok: true, providerMessageId: "<msg-123>" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(BREVO_ENDPOINT);
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>)["api-key"]).toBe(
      "test-key",
    );
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      sender: { name: "Fridge Tracker", email: "reminders@fridge.example" },
      to: [{ email: "user@example.com" }],
      subject: EMAIL.subject,
      htmlContent: EMAIL.html,
      textContent: EMAIL.text,
    });
  });

  it("retries once after a 429 and succeeds", async () => {
    const { calls, fetchFn } = scriptedFetch([
      json(429, { message: "rate limited" }),
      json(201, { messageId: "<msg-2>" }),
    ]);
    const result = await sender(fetchFn).send(EMAIL);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("gives up gracefully after two 5xx responses", async () => {
    const { calls, fetchFn } = scriptedFetch([
      json(503, { message: "down" }),
      json(503, { message: "down" }),
    ]);
    const result = await sender(fetchFn).send(EMAIL);
    expect(result).toMatchObject({ ok: false, retryable: true, status: 503 });
    expect(calls).toHaveLength(2);
  });

  it("does not retry non-retryable 4xx failures (bad key, bad sender…)", async () => {
    const { calls, fetchFn } = scriptedFetch([
      json(401, { message: "Key not found" }),
    ]);
    const result = await sender(fetchFn).send(EMAIL);
    expect(result).toMatchObject({ ok: false, retryable: false, status: 401 });
    expect(calls).toHaveLength(1);
  });

  it("treats network errors like retryable failures and never throws", async () => {
    const { calls, fetchFn } = scriptedFetch([
      new Error("connection reset"),
      new Error("connection reset"),
    ]);
    const result = await sender(fetchFn).send(EMAIL);
    expect(result).toMatchObject({ ok: false, retryable: true, status: null });
    expect(calls).toHaveLength(2);
  });

  it("recovers when the retry follows a network error", async () => {
    const { fetchFn } = scriptedFetch([
      new Error("connection reset"),
      json(201, { messageId: "<msg-3>" }),
    ]);
    const result = await sender(fetchFn).send(EMAIL);
    expect(result.ok).toBe(true);
  });
});
