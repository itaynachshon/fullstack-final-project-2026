import { describe, expect, it } from "vitest";

import { SupabaseWorkerDb } from "./supabase-db.ts";

function capturingFetch(script: Response[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchFn: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = script.shift();
    if (!next) throw new Error("scripted fetch exhausted");
    return next;
  };
  return { calls, fetchFn };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

function db(fetchFn: typeof fetch) {
  return new SupabaseWorkerDb({
    url: "https://proj.supabase.co/",
    serviceRoleKey: "service-key",
    fetchFn,
  });
}

describe("SupabaseWorkerDb", () => {
  it("fetches enabled reminders with service-role headers", async () => {
    const row = {
      id: "r1",
      user_id: "u1",
      days_of_week: [0, 3],
      local_time: "09:00:00",
      timezone: "Asia/Jerusalem",
      enabled: true,
      email_enabled: false,
      in_app_enabled: true,
      last_sent_key: null,
    };
    const { calls, fetchFn } = capturingFetch([json(200, [row])]);

    const rows = await db(fetchFn).fetchEnabledReminders();

    expect(rows).toEqual([row]);
    const { url, init } = calls[0];
    expect(url).toContain(
      "https://proj.supabase.co/rest/v1/restock_reminders?",
    );
    expect(decodeURIComponent(url)).toContain("enabled=is.true");
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe("service-key");
    expect(headers.authorization).toBe("Bearer service-key");
  });

  it("claims an occurrence with a compare-and-set PATCH", async () => {
    const { calls, fetchFn } = capturingFetch([json(200, [{ id: "r1" }])]);

    const claimed = await db(fetchFn).claimOccurrence("r1", "2026-08-23T09:00");

    expect(claimed).toBe(true);
    const { url, init } = calls[0];
    expect(init.method).toBe("PATCH");
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain("id=eq.r1");
    expect(decoded).toContain(
      'or=(last_sent_key.is.null,last_sent_key.neq."2026-08-23T09:00")',
    );
    expect(JSON.parse(String(init.body))).toEqual({
      last_sent_key: "2026-08-23T09:00",
    });
    expect((init.headers as Record<string, string>).prefer).toBe(
      "return=representation",
    );
  });

  it("reports a lost claim when the guarded update matches no rows", async () => {
    const { fetchFn } = capturingFetch([json(200, [])]);
    expect(await db(fetchFn).claimOccurrence("r1", "k")).toBe(false);
  });

  it("maps fridge items, tolerating object and array product embeds", async () => {
    const { calls, fetchFn } = capturingFetch([
      json(200, [
        {
          product_id: "p1",
          remaining_percent: 25,
          finished_at: null,
          product: { name: "Milk" },
        },
        {
          product_id: "p2",
          remaining_percent: 0,
          finished_at: "2026-08-20T10:00:00Z",
          product: [{ name: "Yogurt" }],
        },
        {
          product_id: "p3",
          remaining_percent: 100,
          finished_at: null,
          product: null,
        },
      ]),
    ]);

    const items = await db(fetchFn).fetchRestockItems("u1");

    expect(items).toEqual([
      {
        productId: "p1",
        productName: "Milk",
        remainingPercent: 25,
        finishedAt: null,
      },
      {
        productId: "p2",
        productName: "Yogurt",
        remainingPercent: 0,
        finishedAt: "2026-08-20T10:00:00Z",
      },
      {
        productId: "p3",
        productName: null,
        remainingPercent: 100,
        finishedAt: null,
      },
    ]);
    expect(decodeURIComponent(calls[0].url)).toContain("user_id=eq.u1");
  });

  it("resolves the recipient address via the auth admin endpoint", async () => {
    const { calls, fetchFn } = capturingFetch([
      json(200, { id: "u1", email: "user@example.com" }),
    ]);
    const email = await db(fetchFn).fetchUserEmail("u1");
    expect(email).toBe("user@example.com");
    expect(calls[0].url).toBe(
      "https://proj.supabase.co/auth/v1/admin/users/u1",
    );
  });

  it("returns null for a deleted auth user instead of failing the reminder", async () => {
    const { fetchFn } = capturingFetch([json(404, { message: "not found" })]);
    expect(await db(fetchFn).fetchUserEmail("gone")).toBeNull();
  });

  it("inserts the notification row the RLS layer reserves for service_role", async () => {
    const { calls, fetchFn } = capturingFetch([json(201, [])]);

    await db(fetchFn).insertNotification({
      userId: "u1",
      title: "Time to check what needs restocking",
      body: "Running low: Milk.",
      metadata: { reminder_id: "r1", occurrence_key: "2026-08-23T09:00" },
    });

    const { url, init } = calls[0];
    expect(url).toContain("/rest/v1/notifications");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      user_id: "u1",
      type: "restock_reminder",
      title: "Time to check what needs restocking",
      body: "Running low: Milk.",
      metadata: { reminder_id: "r1", occurrence_key: "2026-08-23T09:00" },
    });
    expect((init.headers as Record<string, string>).prefer).toBe(
      "return=minimal",
    );
  });

  it("surfaces REST failures as errors (the worker isolates them per reminder)", async () => {
    const { fetchFn } = capturingFetch([
      new Response("permission denied", { status: 403 }),
    ]);
    await expect(db(fetchFn).fetchEnabledReminders()).rejects.toThrow(/403/);
  });
});
