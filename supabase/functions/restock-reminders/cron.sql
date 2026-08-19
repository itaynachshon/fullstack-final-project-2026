-- ============================================================================
-- Restock reminders — pg_cron registration (F5 INTEGRATION STEP).
--
-- NOT a migration: supabase/migrations/ is frozen during parallel V2 work.
-- Run this once in the hosted project's SQL editor (or psql) AFTER:
--   1. the Edge Function is deployed:
--        supabase functions deploy restock-reminders --no-verify-jwt
--   2. the function secrets are set:
--        supabase secrets set RESTOCK_CRON_SECRET=... BREVO_API_KEY=... \
--          RESTOCK_EMAIL_FROM=... APP_URL=...
--
-- Full instructions: docs/RESTOCK_REMINDERS.md.
-- ============================================================================

-- pg_cron ships in schema pg_catalog on Supabase; pg_net exposes net.http_post.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── 1. Store the invocation credential in Vault (NOT in this SQL text) ──────
-- The cron job authenticates to the Edge Function with a bearer secret. The
-- value lives in Supabase Vault and is read at run time, so the job text (and
-- this file, and cron.job's saved command) never contains the secret itself.
-- Replace the placeholder with the SAME value used for RESTOCK_CRON_SECRET:
--
--   select vault.create_secret('<paste RESTOCK_CRON_SECRET here>',
--                              'restock_reminders_cron_secret');
--
-- (To rotate: select vault.update_secret(id, '<new value>') using the id from
--  select id, name from vault.secrets;  then update the function secret too.)

-- ── 2. Schedule the worker every 5 minutes ──────────────────────────────────
-- Replace YOUR-PROJECT-REF with the hosted project ref (Dashboard → Settings).
-- net.http_post is asynchronous: it queues the request and returns; responses
-- land in net._http_response for inspection.
select cron.schedule(
  'restock-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/restock-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'restock_reminders_cron_secret'
      )
    ),
    body := jsonb_build_object('source', 'pg_cron'),
    timeout_milliseconds := 15000
  );
  $$
);

-- ── Operations ───────────────────────────────────────────────────────────────
-- Inspect the schedule:      select jobid, jobname, schedule from cron.job;
-- Recent runs:               select jobid, status, return_message, start_time
--                            from cron.job_run_details
--                            order by start_time desc limit 20;
-- Recent worker responses:   select id, status_code, content::text
--                            from net._http_response
--                            order by id desc limit 20;
-- Pause / remove:            select cron.unschedule('restock-reminders');
