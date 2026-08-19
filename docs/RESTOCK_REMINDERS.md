# Fridge Tracker — Restock Reminders & Notifications (F2)

> **Status:** implemented (V2, F2) — 2026-08-18
> **Scope:** reminder schedules UI on `/restock`, the `restock-reminders`
> Supabase Edge Function worker, Brevo transactional email, in-app
> notifications + bell.
> **Cron registration** (`cron.sql`) is applied by F5 integration after the
> parallel V2 branches merge — everything else here is self-contained.

---

## 1. What the user gets

On **`/restock` → "Remind me to restock"** a signed-in user can:

- create **multiple schedules** — each with its own days of week
  (Sunday-first, with *Every day* / *Sun–Thu* presets for the Israeli week),
  a time of day, and an IANA time zone;
- toggle **Email** and/or **In-app notification** per schedule;
- enable/disable, edit, and delete schedules.

The default time zone is **detected from the browser** via
`Intl.DateTimeFormat().resolvedOptions().timeZone` — an Israeli user
naturally gets `Asia/Jerusalem`, a user in Berlin gets `Europe/Berlin`.
Nobody is hard-coded to any country (the fallback for ancient runtimes is
`Asia/Jerusalem`, used only when detection fails).

When a reminder fires and something is actually low/finished:

- **In-app:** a notification row appears under the bell in the top bar
  (unread badge, mark-read, mark-all-read). On phones the top bar is a slim
  brand + bell strip; nav stays in the bottom bar.
- **Email:** a branded "Time to check what needs restocking" message listing
  the user's current low/finished products with a CTA to `APP_URL/restock`,
  sent to the account's auth email (never a client-submitted address).

If **nothing needs restocking** at fire time, the occurrence is consumed and
**nothing is sent** (documented product decision — no noise; §4.4).

## 2. Architecture

```
Supabase pg_cron  (*/5 * * * *)
   └─ pg_net.http_post  (Authorization: Bearer <RESTOCK_CRON_SECRET from Vault>)
        └─ Edge Function  supabase/functions/restock-reminders/
             ├─ PostgREST (service role): restock_reminders, fridge_items, notifications
             ├─ GoTrue admin API: recipient email lookup
             └─ Brevo transactional email API (fetch, no SDK)
```

- **No Vercel cron and no Supabase secret on Vercel.** The Next.js app only
  ever uses the anon key + caller JWT; the service-role key exists solely in
  the Edge Function's environment (platform-provided) — accepted V2
  exception, `docs/FEATURES_V2_PLAN.md` §8.2 as amended by the F0
  coordination correction (Edge Function instead of a Vercel `/api/cron`
  route).
- **Invocation auth:** the function is deployed `--no-verify-jwt` and instead
  requires `Authorization: Bearer $RESTOCK_CRON_SECRET` (timing-safe
  comparison, fail-closed when unset). The cron job reads that secret from
  **Supabase Vault** at run time — it is never hard-coded in SQL, and
  `cron.job`'s stored command only contains the Vault lookup.

### Code layout

| Path | Role |
|---|---|
| `supabase/functions/restock-reminders/index.ts` | Deno entry: secret gate, `now`/`windowMinutes`/`dryRun` test overrides |
| `.../core/schedule.ts` | Pure occurrence math: IANA zones, DST, catch-up window |
| `.../core/restock-items.ts` | "What needs restocking" digest (mirrors `/restock` rules) |
| `.../core/worker.ts` | Orchestration: claim → digest → in-app + email, per-channel outcomes |
| `.../core/supabase-db.ts` | PostgREST/GoTrue adapter (service role, plain `fetch`) |
| `.../email/types.ts` | `EmailSender` abstraction + `DisabledEmailSender` |
| `.../email/brevo.ts` | Brevo adapter (`fetch`, retries on 429/5xx) |
| `.../email/template.ts` | Branded HTML/text email (escaped, RTL-safe) |
| `.../cron.sql` | pg_cron + Vault registration (F5 applies) |
| `src/lib/reminders/` | Next.js-side mappers/format/timezones/queries |
| `src/lib/v2/actions/reminders.ts`, `notifications.ts` | Server actions (RLS, anon key) |
| `src/components/reminders/`, `src/components/notifications/` | `/restock` section, editor sheet, bell |

## 3. Data model (frozen by F0 — no F2 migrations)

`supabase/migrations/20260818000000_v2_foundation.sql` provides:

- **`restock_reminders`** — many per user; `days_of_week smallint[]`
  (0 = Sunday … 6 = Saturday, unique, non-empty), `local_time time`,
  `timezone text`, `enabled`, `email_enabled`, `in_app_enabled`, and
  **`last_sent_key text`** (worker-owned idempotency marker). RLS: owner-only
  for SELECT/INSERT/UPDATE/DELETE. `last_sent_key` is excluded from every
  client input schema — only the worker writes it.
- **`notifications`** — server-generated; owner may SELECT and UPDATE
  **only `read_at`** (column-level grant). No INSERT/DELETE policy or grant
  for `authenticated` — users cannot forge or wipe notification rows; the
  Edge Function's service role creates them.

## 4. Scheduler semantics

### 4.1 Occurrence detection (DST-safe)

Every tick (~5 min) the worker loads enabled reminders and, per reminder,
computes the most recent scheduled occurrence in the reminder's own time
zone within a catch-up window (default **60 minutes**, override via
`windowMinutes`). Wall-clock → UTC conversion uses the runtime's IANA
database via `Intl.DateTimeFormat`:

- **Nonexistent local times** (spring-forward gap, e.g. 02:30 on Israel's
  DST start) resolve to the instant the clock actually reaches — nothing is
  silently dropped.
- **Ambiguous local times** (fall-back repeat) resolve deterministically to
  the first occurrence.
- Cross-midnight and negative-offset zones are covered by unit tests.

### 4.2 Idempotency — an occurrence can never send twice

Each occurrence has a key: `{yyyy-mm-dd}T{HH:MM}` **in the reminder's local
zone**. Before sending, the worker **claims** the occurrence with an atomic
compare-and-set:

```
PATCH /rest/v1/restock_reminders
  ?id=eq.<id>&last_sent_key=neq.<key>   (NULL-safe: or last_sent_key is null)
  { last_sent_key: <key> }
```

Zero rows updated ⇒ another invocation (retry, overlapping cron tick,
manual test run) already owns that occurrence ⇒ skip. This is what makes
duplicate invocation and pg_net retries safe.

### 4.3 Channel independence

In-app insert and email send are attempted independently; **a Brevo failure
never blocks the in-app notification** (and vice versa). Outcomes are
reported per channel in the run summary. Because the occurrence is claimed
first, a partial failure is *not* retried into a duplicate — the design
prefers "at most once per occurrence" over "exactly once" (assignment-scale
tradeoff, documented).

### 4.4 "Nothing to restock" behavior

If the digest is empty (no low units, nothing recently finished), the
occurrence is claimed and **no notification/email is sent**. Rationale: the
reminder's job is "tell me *what* to restock", and an empty nag trains users
to ignore it. (Flip side documented in code: change one guard in
`core/worker.ts` if the product ever wants "all good!" emails.)

### 4.5 Missed ticks / downtime

A tick that arrives late still fires occurrences up to `windowMs` old
(default 60 min). Anything older is considered missed and is skipped — it
will not fire retroactively at a confusing time; the next scheduled
occurrence proceeds normally.

## 5. Email (Brevo)

- `EmailSender` interface (`email/types.ts`); the worker doesn't know which
  provider is behind it. Initial provider: **Brevo transactional API**
  (`POST https://api.brevo.com/v3/smtp/email`, `api-key` header) via plain
  `fetch` — **no SDK dependency** (`package.json` is frozen).
- Retries: one retry after a 429/5xx/network error (two attempts total,
  short delay between); 4xx fails immediately. All failures are
  non-throwing — they surface as a per-channel outcome.
- Content: Fridge Tracker branding, "Time to check what needs restocking",
  up to 8 low + 8 finished product names ("+N more" past that), CTA button
  to `APP_URL/restock`. Product names are HTML-escaped and `dir="auto"`-safe
  for Hebrew. Only the recipient's own inventory appears.
- Recipient: the auth user's email from GoTrue (service role) — never a
  client-supplied address.
- If email secrets are missing, the function still runs: `EmailSender` is
  swapped for `DisabledEmailSender` (logs + reports `skipped`), and in-app
  delivery proceeds.

## 6. Secrets

| Secret | Where it lives | Purpose |
|---|---|---|
| `RESTOCK_CRON_SECRET` | Supabase **function secret** + same value in **Vault** (`restock_reminders_cron_secret`) | Bearer gate for invoking the function |
| `BREVO_API_KEY` | Supabase function secret | Brevo transactional API |
| `RESTOCK_EMAIL_FROM` | Supabase function secret | Verified sender address |
| `APP_URL` | Supabase function secret | Email CTA target (e.g. production URL) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | **Provided automatically** by the Edge runtime | PostgREST/GoTrue access |

**Never** in the browser bundle, never `NEXT_PUBLIC_*`, never on Vercel.
Local template: `supabase/functions/.env.example`.

## 7. Deployment runbook

Prereqs (student dashboard steps):

1. **Brevo:** create an account → SMTP & API → generate an API key; verify
   the sender address you'll use as `RESTOCK_EMAIL_FROM` (Senders &
   Domains). Free tier (300 emails/day) is plenty.
2. **Supabase CLI** linked to the hosted project: `supabase link
   --project-ref <ref>`.

Then:

```bash
# 1. Deploy the function (secret gate replaces JWT verification)
supabase functions deploy restock-reminders --no-verify-jwt

# 2. Set its secrets (generate the cron secret once: openssl rand -hex 32)
supabase secrets set \
  RESTOCK_CRON_SECRET=<generated> \
  BREVO_API_KEY=<from Brevo> \
  RESTOCK_EMAIL_FROM=reminders@your-domain.example \
  APP_URL=https://your-app.vercel.app

# 3. Smoke-test the deployed function (dry run, no writes/sends)
curl -s -X POST "https://<ref>.supabase.co/functions/v1/restock-reminders" \
  -H "Authorization: Bearer <RESTOCK_CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":true}'
```

4. **Cron registration (F5 integration):** run
   `supabase/functions/restock-reminders/cron.sql` in the SQL editor —
   it stores the secret in Vault (`vault.create_secret`), enables
   `pg_cron`/`pg_net`, and schedules `*/5 * * * *`. The file contains the
   operations queries (inspect runs, unschedule, rotate secret).

> `supabase/config.toml` is gitignored; the local-dev block for this
> function (`[functions.restock-reminders]`, `verify_jwt = false`) is
> documented here as the durable record and mirrored in that file locally.

## 8. Local development & manual testing

```bash
supabase start                                   # local stack
cp supabase/functions/.env.example supabase/functions/.env   # fill values
supabase functions serve restock-reminders --no-verify-jwt \
  --env-file supabase/functions/.env

# Fire a specific moment without waiting for wall-clock time:
curl -s -X POST http://127.0.0.1:54321/functions/v1/restock-reminders \
  -H "Authorization: Bearer $RESTOCK_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"now":"2026-08-23T15:30:00Z","dryRun":true}'
```

- `now` — pretend the tick happened at that instant (ISO-8601).
- `dryRun: true` — full evaluation, **no** DB writes, **no** emails; the
  response summary lists what *would* have been sent.
- `windowMinutes` — widen the catch-up window when testing missed ticks.

The same override runs against production for a controlled live test (use a
schedule whose local time just passed, omit `dryRun` to actually send).

## 9. Tests

- **Unit (Vitest, in `npm test`):**
  - `core/schedule.test.ts` — weekday/zone rules, due/not-due, catch-up
    window, DST spring-forward/fall-back (`Asia/Jerusalem`), cross-midnight,
    negative offsets, invalid zones;
  - `core/worker.test.ts` — end-to-end orchestration with fakes: both
    channels, in-app only, email only, disabled schedules, not-due, already
    sent, claim lost to a concurrent run, **no restock items ⇒ silent
    consume**, email failure ⇏ in-app failure, dry run;
  - `email/brevo.test.ts` — 429/5xx retry, network-error retry, 4xx
    fail-fast; `email/template.test.ts` — branding, CTA URL, name capping,
    HTML escaping;
  - `core/supabase-db.test.ts` — PostgREST/GoTrue request shapes, NULL-safe
    claim CAS, error paths;
  - `src/lib/v2/actions/reminders.test.ts` / `notifications.test.ts` —
    action auth/validation/ownership behavior, `last_sent_key` untouchable
    from clients, `read_at`-only updates;
  - `src/lib/reminders/*.test.ts` — mappers, day/zone formatting, browser
    zone detection.
- **E2E (Playwright, env-gated):** `e2e/reminders-rls.spec.ts` — cross-user
  reminder isolation, notification forgery denial (self + cross-user), and —
  with `SUPABASE_SERVICE_ROLE_KEY` present (local stack) — the full
  server-seeded notification read/mark-read matrix incl. the `read_at`-only
  column grant.

## 10. Security summary

See `docs/SECURITY.md` §21: RLS matrix for both tables, the no-secrets-on-
Vercel boundary, cron secret handling (Vault + timing-safe compare,
fail-closed), and why notification forgery is impossible for ordinary users.
