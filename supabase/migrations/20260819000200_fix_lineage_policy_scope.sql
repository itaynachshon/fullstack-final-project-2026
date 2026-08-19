-- ============================================================================
-- Fridge Tracker — fix restock-lineage policy column scoping (F5 hosted fix)
--
-- BUG (found by the first empirical run against a real database — the F0
-- policy had only ever been reviewed statically): inside the policies'
-- ownership subquery
--
--   exists (select 1 from public.fridge_items src
--           where src.id = restocked_from_item_id ...)
--
-- the unqualified `restocked_from_item_id` binds to the INNERMOST scope —
-- src's own column — not to the row being inserted/updated. The condition
-- degenerates to `src.id = src.restocked_from_item_id`, which the
-- fridge_items_restocked_from_not_self CHECK makes permanently false, so the
-- EXISTS never matches and EVERY non-null lineage write was rejected with
-- 42501 — including the legitimate restock flow (restockItem sets
-- restocked_from_item_id on the fresh unit). Attacks were "blocked", but so
-- was the feature.
--
-- FIX: recreate both policies with the outer row referenced explicitly as
-- `fridge_items.restocked_from_item_id` (the unaliased outer table name is
-- visible inside the correlated subquery because the inner table is aliased
-- `src`). Security semantics are unchanged: NULL lineage is always allowed;
-- non-null lineage must reference a row owned by the caller; cross-user and
-- nonexistent ids still fail with the same indistinguishable 42501 before
-- the FK is consulted (no existence oracle).
--
-- Forward fix: 20260818000000_v2_foundation.sql is already applied to the
-- hosted project and is therefore historical — it must not be rewritten.
-- ============================================================================

drop policy "fridge_items: users insert their own items"
  on public.fridge_items;

drop policy "fridge_items: users update their own items"
  on public.fridge_items;

create policy "fridge_items: users insert their own items"
  on public.fridge_items
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      restocked_from_item_id is null
      or exists (
        select 1
        from public.fridge_items src
        where src.id = fridge_items.restocked_from_item_id
          and src.user_id = auth.uid()
      )
    )
  );

create policy "fridge_items: users update their own items"
  on public.fridge_items
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      restocked_from_item_id is null
      or exists (
        select 1
        from public.fridge_items src
        where src.id = fridge_items.restocked_from_item_id
          and src.user_id = auth.uid()
      )
    )
  );
