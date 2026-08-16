-- ============================================================================
-- Fridge Tracker — initial schema (Wave 1, FROZEN CONTRACT)
--
-- Three application tables + Supabase-managed auth.users, per
-- docs/TECHNICAL_DESIGN.md §3:
--   products            shared catalog (seeded / cached OFF / manual)
--   fridge_items        per-user inventory, ONE ROW PER PHYSICAL UNIT
--   consumption_events  per-user append-only consumption log
--
-- Row Level Security is enabled on all three tables and is THE authorization
-- layer: all runtime access uses the anon key + the caller's JWT. The only
-- credential that bypasses RLS (service role) is used by the local seed
-- script and never ships to runtime.
-- ============================================================================


-- ── Extensions ──────────────────────────────────────────────────────────────
-- pg_trgm powers Hebrew-compatible substring search on product names.
-- Installed into the `extensions` schema (Supabase convention); the schema is
-- created first so the migration also applies cleanly to plain Postgres.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;


-- ── products — shared catalog, one row per GTIN (or barcode-less manual) ────
create table public.products (
  id           uuid primary key default gen_random_uuid(),
  -- Canonical barcode TEXT (leading zeros are significant; never numeric).
  -- Nullable: manual products may have no barcode.
  barcode      text,
  name         text not null,
  brand        text,
  -- Display string, e.g. '250 g' — not parsed, only shown.
  package_size text,
  -- Fixed 10-value taxonomy owned by the product (docs/TECHNICAL_DESIGN.md §3.1).
  category     text not null default 'Other',
  -- Hotlinked Open Food Facts image; host allow-listed in next.config.ts.
  image_url    text,
  -- Provenance: 'catalog' = seeded, 'off' = cached Open Food Facts hit,
  -- 'user' = manual creation.
  source       text not null,
  -- Creator for 'off'/'user' rows; NULL for seeded rows. Catalog rows outlive
  -- their creators.
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),

  constraint products_name_not_empty
    check (char_length(name) > 0),
  constraint products_source_valid
    check (source in ('catalog', 'off', 'user')),
  constraint products_category_valid
    check (category in (
      'Dairy', 'Meat & Fish', 'Vegetables', 'Fruit', 'Drinks',
      'Sauces & Spreads', 'Snacks', 'Prepared', 'Frozen', 'Other'
    ))
);

-- One catalog row per GTIN. Partial: many manual products legitimately have
-- barcode IS NULL, and the partial form documents intent and keeps the index
-- small. Serves the lookup chain's primary query (exact barcode match).
create unique index products_barcode_key
  on public.products (barcode)
  where barcode is not null;

-- Trigram index for substring/similarity name search (works for Hebrew).
create index products_name_trgm_idx
  on public.products
  using gin (name extensions.gin_trgm_ops);


-- ── fridge_items — per-user inventory, one row per physical unit ────────────
-- "Two milk cartons, one half-finished" = two rows (100 and 50).
create table public.fridge_items (
  id                uuid primary key default gen_random_uuid(),
  -- Deleting an account removes its fridge.
  user_id           uuid not null references auth.users (id) on delete cascade,
  -- Products are never deleted (no DELETE policy exists), so this FK cannot
  -- fire; NO ACTION is the deliberate default.
  product_id        uuid not null references public.products (id),
  -- The five-level consumption model, enforced by the database — not just UI.
  remaining_percent int not null default 100,
  added_at          timestamptz not null default now(),
  -- Stamped when remaining hits 0; cleared if the level is corrected upward.
  finished_at       timestamptz,
  -- Maintained by the mutating server action (no trigger by design).
  updated_at        timestamptz not null default now(),

  constraint fridge_items_remaining_valid
    check (remaining_percent in (0, 25, 50, 75, 100))
);

-- Fridge view (live items per user) and restock derivations (finished per
-- user, recent-first).
create index fridge_items_user_finished_idx
  on public.fridge_items (user_id, finished_at);

-- Join back to catalog; "does the user hold a live unit of this product".
create index fridge_items_product_idx
  on public.fridge_items (product_id);


-- ── consumption_events — per-user append-only log ───────────────────────────
-- One row per consume action, written in the same server action as the
-- update; powers the restock page's recent-activity feed.
create table public.consumption_events (
  id              uuid primary key default gen_random_uuid(),
  -- Deleting an item removes its history.
  fridge_item_id  uuid not null references public.fridge_items (id) on delete cascade,
  -- Denormalized owner (also derivable via the item) so RLS on this table is
  -- a direct column comparison.
  user_id         uuid not null references auth.users (id) on delete cascade,
  -- Signed change, delta = old − new (docs/IMPLEMENTATION_PLAN.md §12):
  -- positive = points consumed, negative = correction upward/restoration.
  delta_percent   int not null,
  remaining_after int not null,
  created_at      timestamptz not null default now(),

  constraint consumption_events_delta_valid
    check (delta_percent between -100 and 100),
  constraint consumption_events_remaining_valid
    check (remaining_after in (0, 25, 50, 75, 100))
);

-- Recent-activity feed (last ~10 events per user, newest first).
create index consumption_events_user_created_idx
  on public.consumption_events (user_id, created_at desc);


-- ============================================================================
-- Row Level Security — the authorization layer (docs/TECHNICAL_DESIGN.md §3.4)
--
-- Ownership model in one sentence: catalog rows belong to everyone (read) and
-- to their creator (limited write); fridge and history rows belong
-- exclusively to one user.
-- ============================================================================

alter table public.products enable row level security;
alter table public.fridge_items enable row level security;
alter table public.consumption_events enable row level security;

-- ── products policies ────────────────────────────────────────────────────────

-- The catalog is shared reference data: any signed-in user can read all rows.
create policy "products: authenticated users read the shared catalog"
  on public.products
  for select
  to authenticated
  using (true);

-- Users add to the shared catalog only as themselves, and only rows whose
-- provenance is 'user' (manual creation) or 'off' (the server-side Open Food
-- Facts cache write, which runs under the scanning user's JWT — no privileged
-- key at runtime). Seeded 'catalog' rows are inserted by the local seed
-- script with the service-role key, which bypasses RLS by design.
create policy "products: users insert their own user/off rows"
  on public.products
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and source in ('user', 'off')
  );

-- Users may correct their own manual products only. The MVP ships no
-- product-edit UI, so this policy is dormant but principled.
create policy "products: creators update their own manual rows"
  on public.products
  for update
  to authenticated
  using (created_by = auth.uid() and source = 'user')
  with check (created_by = auth.uid() and source = 'user');

-- No DELETE policy: catalog rows are never deleted.

-- ── fridge_items policies — strict per-user isolation ───────────────────────

create policy "fridge_items: users read their own items"
  on public.fridge_items
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "fridge_items: users insert their own items"
  on public.fridge_items
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "fridge_items: users update their own items"
  on public.fridge_items
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "fridge_items: users delete their own items"
  on public.fridge_items
  for delete
  to authenticated
  using (user_id = auth.uid());

-- ── consumption_events policies — per-user, append-only ─────────────────────

create policy "consumption_events: users read their own events"
  on public.consumption_events
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "consumption_events: users insert their own events"
  on public.consumption_events
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- No UPDATE policy (append-only) and no DELETE policy (rows are removed only
-- via the fridge_items ON DELETE CASCADE).
