-- ============================================================================
-- Fridge Tracker — explicit Data API grants (Wave 5)
--
-- Why this migration exists: Supabase changed its platform default
-- (changelog #45329). Projects created on/after 2026-05-30 — including this
-- project's hosted instance and the Supabase CLI local stack — no longer
-- grant SELECT/INSERT/UPDATE/DELETE on new `public` tables to the Data API
-- roles automatically. Without explicit grants the whole app fails with
-- "permission denied" before RLS is even consulted (reproduced empirically
-- against a fresh local stack during Wave 5).
--
-- Grant design: this project's documented authorization model is
-- "table privileges are broad, Row Level Security is THE per-row
-- authorization layer" (docs/SECURITY.md §4). The grants below restore
-- exactly the legacy Supabase model that the schema, the security audit,
-- and the RLS test matrix were built and verified against:
--
--   authenticated — full verb access on all three tables; every row-level
--                   decision (including "no UPDATE/DELETE policy on events
--                   or products → statement matches zero rows") stays with
--                   the RLS policies.
--   service_role  — full verb access; used only by the local seed script
--                   (bypasses RLS by design, never deployed).
--   anon          — NO grants. Signed-out clients are rejected at the
--                   privilege layer, one layer before RLS's default-deny.
-- ============================================================================

-- Idempotent-safe: GRANT is additive; re-running does not error.
grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete
  on table public.products, public.fridge_items, public.consumption_events
  to authenticated, service_role;
