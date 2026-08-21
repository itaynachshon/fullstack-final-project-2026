-- Fridge Tracker V2 — convergence hardening: restock_reminders column privileges
--
-- WHY THIS MIGRATION EXISTS
-- 20260818000000_v2_foundation.sql granted broad
-- `insert, update on public.restock_reminders to authenticated`. Combined
-- with the (correct) owner-scoped RLS UPDATE policy, that let any signed-in
-- user PATCH **their own** row's `last_sent_key` directly through PostgREST,
-- bypassing the app-layer Zod schemas (which are a convenience, not a
-- security boundary).
--
-- `last_sent_key` is scheduler bookkeeping: the Edge Function worker
-- (service_role) uses it as an idempotency compare-and-set to guarantee at
-- most one send per (reminder, occurrence). A user who could write it could
-- suppress their own reminders (set a future key) or force duplicate sends
-- (clear it) — self-inflicted, but it corrupts worker-owned state and the
-- "exactly one send" audit trail.
--
-- FIX (same column-grant pattern F0 already used for `notifications` and
-- `ai_action_proposals`): replace the table-wide INSERT/UPDATE grants with
-- column lists that exclude `last_sent_key` (and the immutable id/user_id/
-- created_at where the app never writes them). PostgREST surfaces a write to
-- any non-granted column as 42501 permission denied. service_role retains
-- full table privileges from the foundation migration, so the worker's
-- compare-and-set is unaffected. SELECT/DELETE are untouched (reading your
-- own `last_sent_key` is harmless; deleting your own reminder is a feature).
--
-- Additive only — the foundation migration is never rewritten.

-- Drop only the two broad privileges being narrowed.
revoke insert, update
  on table public.restock_reminders
  from authenticated;

-- INSERT: user-editable schedule fields only. `user_id` stays insertable —
-- RLS `with check (user_id = auth.uid())` pins its value. `id`,
-- `created_at`, `updated_at` and `last_sent_key` come from column defaults
-- (last_sent_key starts NULL: "never sent").
grant insert (
    user_id,
    days_of_week,
    local_time,
    timezone,
    enabled,
    email_enabled,
    in_app_enabled
  )
  on table public.restock_reminders
  to authenticated;

-- UPDATE: schedule fields + updated_at (the server action stamps it).
-- No `last_sent_key`, no `user_id` (no re-parenting), no `created_at`.
grant update (
    days_of_week,
    local_time,
    timezone,
    enabled,
    email_enabled,
    in_app_enabled,
    updated_at
  )
  on table public.restock_reminders
  to authenticated;
