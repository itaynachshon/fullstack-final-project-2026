import { expect, test } from "@playwright/test";

import { hasTwoUsers } from "./support/environment";
import {
  createUserClient,
  userACredentials,
  userBCredentials,
} from "./support/supabase";

/**
 * F5 hosted verification of the V2 restock-lineage policy
 * (docs/SECURITY.md §23): `fridge_items.restocked_from_item_id` may only
 * reference a row the caller owns. Foreign keys are checked with table-owner
 * rights (they bypass RLS), so without the policy's ownership subquery the FK
 * would double as a UUID existence oracle — the same class of gap Wave 5
 * closed on consumption_events.
 *
 * All attacks run through ordinary anon-key clients signed in as the two
 * dedicated E2E users; the service role is never used here.
 */
test.describe("@rls fridge restock lineage isolation", () => {
  test.skip(
    !hasTwoUsers,
    "Requires Supabase and pre-created credentials for E2E users A and B.",
  );

  test("lineage cannot point at foreign or nonexistent items, and failures are indistinguishable", async () => {
    const clientA = await createUserClient(userACredentials());
    const clientB = await createUserClient(userBCredentials());
    const runTag = `E2E Lineage ${Date.now()}`;
    const createdItemIdsA: string[] = [];
    const createdItemIdsB: string[] = [];

    try {
      const [{ data: authA }, { data: authB }] = await Promise.all([
        clientA.auth.getUser(),
        clientB.auth.getUser(),
      ]);
      const userAId = authA.user?.id;
      const userBId = authB.user?.id;
      expect(userAId).toBeTruthy();
      expect(userBId).toBeTruthy();
      expect(userAId).not.toBe(userBId);

      // A creates a run-unique shared product and owns one fridge unit of it.
      const { data: product, error: productError } = await clientA
        .from("products")
        .insert({
          name: runTag,
          category: "Other",
          source: "user",
          created_by: userAId,
        })
        .select("id")
        .single();
      expect(productError).toBeNull();
      const productId = product!.id as string;

      const { data: itemA, error: itemAError } = await clientA
        .from("fridge_items")
        .insert({ user_id: userAId, product_id: productId })
        .select("id")
        .single();
      expect(itemAError).toBeNull();
      const itemAId = itemA!.id as string;
      createdItemIdsA.push(itemAId);

      // (a) B inserts an own row whose lineage points at A's item.
      const { error: foreignLineageError } = await clientB
        .from("fridge_items")
        .insert({
          user_id: userBId,
          product_id: productId,
          restocked_from_item_id: itemAId,
        });
      expect(foreignLineageError).not.toBeNull();
      expect(foreignLineageError!.code).toBe("42501");

      // (b) Same insert with a random nonexistent UUID — the failure must be
      // indistinguishable from (a) so lineage cannot probe row existence.
      const { error: ghostLineageError } = await clientB
        .from("fridge_items")
        .insert({
          user_id: userBId,
          product_id: productId,
          restocked_from_item_id: "00000000-0000-4000-8000-000000000000",
        });
      expect(ghostLineageError).not.toBeNull();
      expect(ghostLineageError!.code).toBe(foreignLineageError!.code);
      expect(ghostLineageError!.message).toBe(foreignLineageError!.message);

      // (c) B owns a legitimate row, then tries to re-point its lineage at
      // A's item via UPDATE.
      const { data: itemB, error: itemBError } = await clientB
        .from("fridge_items")
        .insert({ user_id: userBId, product_id: productId })
        .select("id")
        .single();
      expect(itemBError).toBeNull();
      const itemBId = itemB!.id as string;
      createdItemIdsB.push(itemBId);

      const { error: updateForeignError } = await clientB
        .from("fridge_items")
        .update({ restocked_from_item_id: itemAId })
        .eq("id", itemBId)
        .select("id");
      expect(updateForeignError).not.toBeNull();
      expect(updateForeignError!.code).toBe("42501");

      const { error: updateGhostError } = await clientB
        .from("fridge_items")
        .update({
          restocked_from_item_id: "00000000-0000-4000-8000-000000000001",
        })
        .eq("id", itemBId)
        .select("id");
      expect(updateGhostError).not.toBeNull();
      expect(updateGhostError!.code).toBe(updateForeignError!.code);

      // A's row is untouched and B's row gained no lineage.
      const { data: itemBAfter } = await clientB
        .from("fridge_items")
        .select("restocked_from_item_id")
        .eq("id", itemBId)
        .single();
      expect(itemBAfter?.restocked_from_item_id).toBeNull();

      // Legitimate same-user lineage (the real restock flow) still works.
      const { data: restockB, error: restockBError } = await clientB
        .from("fridge_items")
        .insert({
          user_id: userBId,
          product_id: productId,
          restocked_from_item_id: itemBId,
        })
        .select("id, restocked_from_item_id")
        .single();
      expect(restockBError).toBeNull();
      expect(restockB!.restocked_from_item_id).toBe(itemBId);
      createdItemIdsB.push(restockB!.id as string);
    } finally {
      if (createdItemIdsB.length > 0) {
        await clientB.from("fridge_items").delete().in("id", createdItemIdsB);
      }
      if (createdItemIdsA.length > 0) {
        await clientA.from("fridge_items").delete().in("id", createdItemIdsA);
      }
      // The run-unique product row stays: ordinary users have no product
      // DELETE permission (documented test-data convention).
      await Promise.all([clientA.auth.signOut(), clientB.auth.signOut()]);
    }
  });
});
