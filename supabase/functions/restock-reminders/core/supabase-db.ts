/**
 * WorkerDb implementation over Supabase's REST surface (PostgREST + GoTrue
 * admin) using plain fetch — no supabase-js import, which keeps the module
 * dependency-free, testable under Vitest, and trivially bundleable by the
 * Edge Function CLI.
 *
 * Runs with the service-role key: notifications INSERT and `last_sent_key`
 * updates are deliberately impossible for ordinary authenticated clients
 * (see 20260818000000_v2_foundation.sql). The key exists only inside the
 * Supabase Edge Function environment — never in Vercel or the browser.
 */

import type { RestockSourceItem } from "./restock-items.ts";
import type { NotificationInsert, ReminderRow, WorkerDb } from "./worker.ts";

export interface SupabaseWorkerDbOptions {
  /** Project URL, e.g. https://abcd.supabase.co (no trailing slash needed). */
  url: string;
  serviceRoleKey: string;
  /** Injectable for tests; defaults to the platform fetch. */
  fetchFn?: typeof fetch;
}

const REMINDER_COLUMNS =
  "id,user_id,days_of_week,local_time,timezone,enabled,email_enabled,in_app_enabled,last_sent_key";

interface FridgeItemRow {
  product_id: string;
  remaining_percent: number;
  finished_at: string | null;
  product: { name: string } | { name: string }[] | null;
}

function firstEmbed<T>(value: T | T[] | null): T | null {
  if (value === null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export class SupabaseWorkerDb implements WorkerDb {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: SupabaseWorkerDbOptions) {
    this.baseUrl = options.url.replace(/\/+$/, "");
    this.fetchFn = options.fetchFn ?? fetch;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      apikey: this.options.serviceRoleKey,
      authorization: `Bearer ${this.options.serviceRoleKey}`,
      "content-type": "application/json",
      ...extra,
    };
  }

  private async rest(
    method: string,
    path: string,
    search: URLSearchParams,
    init?: { body?: unknown; headers?: Record<string, string> },
  ): Promise<Response> {
    const response = await this.fetchFn(
      `${this.baseUrl}${path}?${search.toString()}`,
      {
        method,
        headers: this.headers(init?.headers),
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      },
    );
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      throw new Error(
        `${method} ${path} failed with ${response.status}${detail ? `: ${detail}` : ""}`,
      );
    }
    return response;
  }

  async fetchEnabledReminders(): Promise<ReminderRow[]> {
    const search = new URLSearchParams({
      select: REMINDER_COLUMNS,
      enabled: "is.true",
      order: "created_at.asc",
    });
    const response = await this.rest(
      "GET",
      "/rest/v1/restock_reminders",
      search,
    );
    return (await response.json()) as ReminderRow[];
  }

  async claimOccurrence(reminderId: string, key: string): Promise<boolean> {
    // One UPDATE with a guard filter = an atomic compare-and-set. Concurrent
    // callers serialize on the row lock; the loser's WHERE no longer matches
    // (last_sent_key already equals the key) and it updates zero rows.
    // The quoted PostgREST literal is safe: keys are `YYYY-MM-DDTHH:MM`.
    const search = new URLSearchParams({
      id: `eq.${reminderId}`,
      or: `(last_sent_key.is.null,last_sent_key.neq."${key}")`,
      select: "id",
    });
    const response = await this.rest(
      "PATCH",
      "/rest/v1/restock_reminders",
      search,
      {
        body: { last_sent_key: key },
        headers: { prefer: "return=representation" },
      },
    );
    const rows = (await response.json()) as Array<{ id: string }>;
    return rows.length > 0;
  }

  async fetchRestockItems(userId: string): Promise<RestockSourceItem[]> {
    const search = new URLSearchParams({
      select: "product_id,remaining_percent,finished_at,product:products(name)",
      user_id: `eq.${userId}`,
    });
    const response = await this.rest("GET", "/rest/v1/fridge_items", search);
    const rows = (await response.json()) as FridgeItemRow[];
    return rows.map((row) => ({
      productId: row.product_id,
      productName: firstEmbed(row.product)?.name ?? null,
      remainingPercent: row.remaining_percent,
      finishedAt: row.finished_at,
    }));
  }

  async fetchUserEmail(userId: string): Promise<string | null> {
    const response = await this.fetchFn(
      `${this.baseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      { method: "GET", headers: this.headers() },
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`auth admin lookup failed with ${response.status}`);
    }
    const body = (await response.json()) as { email?: unknown };
    return typeof body.email === "string" && body.email.length > 0
      ? body.email
      : null;
  }

  async insertNotification(notification: NotificationInsert): Promise<void> {
    const search = new URLSearchParams();
    await this.rest("POST", "/rest/v1/notifications", search, {
      body: {
        user_id: notification.userId,
        type: "restock_reminder",
        title: notification.title,
        body: notification.body,
        metadata: notification.metadata,
      },
      headers: { prefer: "return=minimal" },
    });
  }
}
