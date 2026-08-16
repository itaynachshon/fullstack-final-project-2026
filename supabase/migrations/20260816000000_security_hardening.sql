-- ============================================================================
-- Fridge Tracker — Wave 5 security hardening
--
-- Two database-level fixes identified by the Wave 4 security audit
-- (docs/SECURITY.md §5, §9). The Wave 1 migration is a frozen contract, so
-- both changes ship as this new migration instead of a rewrite.
--
--   1. consumption_events INSERT must verify ownership of the REFERENCED
--      fridge item, not only the event's own user_id. Without this, an
--      authenticated user B could insert an event with user_id = B but
--      fridge_item_id = one of user A's items (the FK check runs with
--      table-owner rights and bypasses RLS), polluting B's own history with
--      references to foreign rows and — because the FK error 23503 fires
--      only for nonexistent UUIDs — leaking whether a guessed UUID is a
--      real fridge item (a UUID-existence oracle).
--
--   2. products.image_url gets a CHECK constraint matching the two
--      application-level guards that already exist (the Open Food Facts
--      client's safeImageUrl on the write path, renderableImageSrc on the
--      render path): NULL, or an https URL on Open Food Facts' image host.
--      Compatible with all existing data by construction: seeded catalog
--      rows always store NULL (scripts/seed-db.ts), manual products never
--      set an image, and cached OFF rows only store safeImageUrl output.
-- ============================================================================


-- ── 1. consumption_events: events may only reference the caller's items ─────
-- Replaces the Wave 1 INSERT policy (user_id check only) with user_id +
-- referenced-item ownership. The EXISTS subquery runs under the caller's
-- own RLS view of fridge_items (SELECT policy: user_id = auth.uid()), so a
-- foreign item id and a nonexistent item id fail identically with RLS error
-- 42501 — closing both the cross-user reference and the existence oracle.
-- The owner's normal consume path is unaffected: their item is visible to
-- them, so EXISTS is true. The explicit items.user_id predicate is redundant
-- under current fridge_items RLS but states the intent directly.

drop policy "consumption_events: users insert their own events"
  on public.consumption_events;

create policy "consumption_events: users insert events for their own items"
  on public.consumption_events
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.fridge_items items
      where items.id = fridge_item_id
        and items.user_id = auth.uid()
    )
  );


-- ── 2. products.image_url: database backstop for the image allow-list ───────
-- The prefix form (scheme + exact host + '/') rejects lookalike hosts
-- (images.openfoodfacts.org.evil.example), http downgrades, javascript:/data:
-- schemes, and relative paths — the same set the render-time guard filters.

alter table public.products
  add constraint products_image_url_allowed
  check (
    image_url is null
    or image_url like 'https://images.openfoodfacts.org/%'
  );
