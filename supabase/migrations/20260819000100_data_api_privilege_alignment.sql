-- ============================================================================
-- Fridge Tracker — Data API privilege alignment (F5 hosted integration)
--
-- WHY THIS MIGRATION EXISTS
-- The hosted project (and any project with legacy default ACLs) carries
-- `ALTER DEFAULT PRIVILEGES` entries that grant ALL table privileges to
-- anon / authenticated / service_role the moment a table is CREATEd:
--
--   pg_default_acl (postgres, schema public, tables):
--     anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm
--
-- 20260816000100_data_api_grants.sql assumed the opposite platform default
-- ("new tables get no auto-grants") and therefore only ever GRANTed. On this
-- project that assumption silently drifted the live privilege matrix away
-- from the documented, tested design (docs/SECURITY.md §5, §20–21):
--
--   * anon held full table privileges on every table (RLS still blocked all
--     rows — no policy targets anon — but the documented "no grants for
--     anon" posture was not true at the privilege layer).
--   * authenticated held table-wide UPDATE on notifications and
--     ai_action_proposals, voiding the column-scoped hardening
--     (read_at-only / status+updated_at-only). An owner could have rewritten
--     their own notification text or a pending proposal payload directly
--     through PostgREST. Cross-user access and INSERT forgery remained
--     blocked by RLS throughout.
--   * authenticated held DELETE / TRUNCATE / REFERENCES / TRIGGER it was
--     never meant to have (unreachable through PostgREST verbs, but contrary
--     to intent).
--
-- restock_reminders was already correct because
-- 20260819000000_v2_reminder_column_privileges.sql used REVOKE-then-GRANT.
-- This migration applies the same pattern everywhere else and removes the
-- default-ACL source of the drift so future tables cannot regress.
--
-- Additive only: no historical migration is rewritten; the statements below
-- are idempotent-safe (REVOKE of an absent privilege is a no-op).
-- ============================================================================

-- ── 1. anon: no table privileges at all ─────────────────────────────────────
-- Signed-out clients are rejected at the privilege layer (42501), one layer
-- before RLS's default-deny — the posture documented in
-- 20260816000100_data_api_grants.sql and docs/SECURITY.md §5.

revoke all privileges on all tables in schema public from anon;

-- Stop the default ACL from re-granting to anon on future tables created by
-- migrations (which run as postgres).
alter default privileges for role postgres in schema public
  revoke all on tables from anon;

-- ── 2. authenticated: DML only, never DDL-adjacent verbs ─────────────────────
revoke truncate, references, trigger
  on all tables in schema public
  from authenticated;

-- ── 3. notifications: SELECT + UPDATE(read_at) only ─────────────────────────
-- Server-generated rows: no INSERT (forgery) and no DELETE (wiping) for
-- ordinary users; owners may only flip read_at.

revoke insert, update, delete
  on table public.notifications
  from authenticated;

grant update (read_at)
  on table public.notifications
  to authenticated;

-- ── 4. ai_action_proposals: payload is immutable to clients ─────────────────
-- INSERT stays table-wide (RLS pins user_id/status='pending'); UPDATE is
-- limited to the accept/reject bookkeeping columns; no DELETE.

revoke update, delete
  on table public.ai_action_proposals
  from authenticated;

grant update (status, updated_at)
  on table public.ai_action_proposals
  to authenticated;
