/**
 * Supabase Edge Function: restock-reminders.
 *
 * Invocation path (docs/RESTOCK_REMINDERS.md): pg_cron → pg_net →
 * THIS FUNCTION → Postgres (notifications, last_sent_key) + Brevo email.
 * There is deliberately no Vercel cron and no Supabase secret on Vercel.
 *
 * Auth: deployed with --no-verify-jwt; every request must instead carry
 * `Authorization: Bearer ${RESTOCK_CRON_SECRET}`. The cron job reads that
 * secret from Supabase Vault (never hard-coded in SQL); the same value is a
 * function secret here. Anon/service JWTs do NOT pass this gate — that
 * matters because the test-timestamp override below could otherwise be used
 * to fire future occurrences early.
 *
 * Local testing (works against `supabase start` + `functions serve`):
 *   curl -X POST http://127.0.0.1:54321/functions/v1/restock-reminders \
 *     -H "Authorization: Bearer $RESTOCK_CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"now":"2026-08-23T06:00:00Z","dryRun":true}'
 *
 * Body (all optional): { now?: ISO string, windowMinutes?: number,
 * dryRun?: boolean } — `now` and `dryRun` exist so schedules can be tested
 * without waiting for wall-clock time.
 */

import { SupabaseWorkerDb } from "./core/supabase-db.ts";
import { runReminderWorker } from "./core/worker.ts";
import { BrevoEmailSender } from "./email/brevo.ts";
import { DisabledEmailSender, type EmailSender } from "./email/types.ts";

// The project tsconfig typechecks this file without Deno lib types; declare
// the two APIs the entry uses. Harmless at runtime (Deno provides them).
declare const Deno: {
  serve(handler: (request: Request) => Response | Promise<Response>): unknown;
  env: { get(name: string): string | undefined };
};

const MIN_WINDOW_MINUTES = 1;
const MAX_WINDOW_MINUTES = 12 * 60;

interface InvocationBody {
  now?: unknown;
  windowMinutes?: unknown;
  dryRun?: unknown;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Constant-time-ish comparison so the secret can't be probed byte by byte. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

function buildEmailSender(): EmailSender {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  const fromEmail = Deno.env.get("RESTOCK_EMAIL_FROM");
  const appUrl = Deno.env.get("APP_URL");
  const missing = [
    apiKey ? null : "BREVO_API_KEY",
    fromEmail ? null : "RESTOCK_EMAIL_FROM",
    appUrl ? null : "APP_URL",
  ].filter((name): name is string => name !== null);
  if (missing.length > 0) {
    return new DisabledEmailSender(`missing secrets: ${missing.join(", ")}`);
  }
  return new BrevoEmailSender({ apiKey: apiKey!, fromEmail: fromEmail! });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json(405, { error: "POST only" });
  }

  const cronSecret = Deno.env.get("RESTOCK_CRON_SECRET");
  if (!cronSecret) {
    // Fail closed: without the shared secret nobody may trigger sends.
    console.error("RESTOCK_CRON_SECRET is not configured");
    return json(500, { error: "worker is not configured" });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!provided || !secretsMatch(provided, cronSecret)) {
    return json(401, { error: "unauthorized" });
  }

  let body: InvocationBody = {};
  const rawBody = await request.text();
  if (rawBody.trim().length > 0) {
    try {
      body = JSON.parse(rawBody) as InvocationBody;
    } catch {
      return json(400, { error: "body must be JSON" });
    }
  }

  let nowMs = Date.now();
  if (body.now !== undefined) {
    if (typeof body.now !== "string" || Number.isNaN(Date.parse(body.now))) {
      return json(400, { error: "`now` must be an ISO-8601 timestamp" });
    }
    nowMs = Date.parse(body.now);
  }

  let windowMs: number | undefined;
  if (body.windowMinutes !== undefined) {
    if (
      typeof body.windowMinutes !== "number" ||
      !Number.isFinite(body.windowMinutes)
    ) {
      return json(400, { error: "`windowMinutes` must be a number" });
    }
    const clamped = Math.min(
      MAX_WINDOW_MINUTES,
      Math.max(MIN_WINDOW_MINUTES, Math.floor(body.windowMinutes)),
    );
    windowMs = clamped * 60 * 1000;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing");
    return json(500, { error: "worker is not configured" });
  }

  try {
    const summary = await runReminderWorker(
      {
        db: new SupabaseWorkerDb({ url: supabaseUrl, serviceRoleKey }),
        email: buildEmailSender(),
        appUrl: Deno.env.get("APP_URL") ?? "http://localhost:3000",
        log: (message) => console.log(`[restock-reminders] ${message}`),
      },
      {
        nowMs,
        windowMs,
        dryRun: body.dryRun === true,
      },
    );
    return json(200, summary);
  } catch (error) {
    console.error("[restock-reminders] run failed:", error);
    return json(500, { error: "worker run failed" });
  }
});
