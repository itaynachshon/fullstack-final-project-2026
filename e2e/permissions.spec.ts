import { expect, test } from "@playwright/test";

import { hasTwoUsers } from "./support/environment";
import {
  createUserClient,
  userACredentials,
  userBCredentials,
} from "./support/supabase";

test.describe("@rls ordinary-user database isolation", () => {
  test.skip(
    !hasTwoUsers,
    "Requires Supabase and pre-created credentials for E2E users A and B.",
  );

  test("User B cannot read, update, delete, or impersonate User A's fridge rows", async ({
    browserName,
  }, testInfo) => {
    const clientA = await createUserClient(userACredentials());
    const clientB = await createUserClient(userBCredentials());
    const runId = `${browserName}-${testInfo.workerIndex}-${Date.now()}`;
    let itemAId: string | undefined;

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

      const { data: product, error: productError } = await clientA
        .from("products")
        .insert({
          name: `E2E RLS Product ${runId}`,
          category: "Other",
          source: "user",
          created_by: userAId,
        })
        .select("id")
        .single();
      expect(productError).toBeNull();
      expect(product).toBeTruthy();

      const { data: itemA, error: itemError } = await clientA
        .from("fridge_items")
        .insert({
          user_id: userAId,
          product_id: product!.id,
          remaining_percent: 100,
        })
        .select("id")
        .single();
      expect(itemError).toBeNull();
      itemAId = itemA!.id as string;

      const { data: eventA, error: eventError } = await clientA
        .from("consumption_events")
        .insert({
          fridge_item_id: itemAId,
          user_id: userAId,
          delta_percent: 25,
          remaining_after: 75,
        })
        .select("id")
        .single();
      expect(eventError).toBeNull();

      // The product catalog is intentionally shared.
      const { data: sharedProduct, error: sharedProductError } = await clientB
        .from("products")
        .select("id")
        .eq("id", product!.id);
      expect(sharedProductError).toBeNull();
      expect(sharedProduct).toHaveLength(1);

      const { data: foreignRead, error: foreignReadError } = await clientB
        .from("fridge_items")
        .select("id, remaining_percent")
        .eq("id", itemAId);
      expect(foreignReadError).toBeNull();
      expect(foreignRead).toEqual([]);

      const { data: foreignUpdate, error: foreignUpdateError } = await clientB
        .from("fridge_items")
        .update({ remaining_percent: 25 })
        .eq("id", itemAId)
        .select("id");
      expect(foreignUpdateError).toBeNull();
      expect(foreignUpdate).toEqual([]);

      const { data: foreignDelete, error: foreignDeleteError } = await clientB
        .from("fridge_items")
        .delete()
        .eq("id", itemAId)
        .select("id");
      expect(foreignDeleteError).toBeNull();
      expect(foreignDelete).toEqual([]);

      const { data: ownerRead, error: ownerReadError } = await clientA
        .from("fridge_items")
        .select("remaining_percent")
        .eq("id", itemAId)
        .single();
      expect(ownerReadError).toBeNull();
      expect(ownerRead?.remaining_percent).toBe(100);

      const { error: impersonationError } = await clientB
        .from("fridge_items")
        .insert({
          user_id: userAId,
          product_id: product!.id,
          remaining_percent: 100,
        });
      expect(impersonationError).not.toBeNull();

      const { data: foreignEvents, error: foreignEventsError } = await clientB
        .from("consumption_events")
        .select("id")
        .eq("id", eventA!.id);
      expect(foreignEventsError).toBeNull();
      expect(foreignEvents).toEqual([]);

      const { data: eventUpdate, error: eventUpdateError } = await clientB
        .from("consumption_events")
        .update({ remaining_after: 50 })
        .eq("id", eventA!.id)
        .select("id");
      expect(eventUpdateError).toBeNull();
      expect(eventUpdate).toEqual([]);

      const { data: eventDelete, error: eventDeleteError } = await clientB
        .from("consumption_events")
        .delete()
        .eq("id", eventA!.id)
        .select("id");
      expect(eventDeleteError).toBeNull();
      expect(eventDelete).toEqual([]);

      const { error: eventImpersonationError } = await clientB
        .from("consumption_events")
        .insert({
          fridge_item_id: itemAId,
          user_id: userAId,
          delta_percent: 25,
          remaining_after: 75,
        });
      expect(eventImpersonationError).not.toBeNull();

      // Wave 5 hardening: even with their own user_id, User B may not log an
      // event that references User A's fridge item (the INSERT policy now
      // requires ownership of the referenced item, and a foreign item id
      // fails the same way a nonexistent one does — no existence oracle).
      const { error: crossItemEventError } = await clientB
        .from("consumption_events")
        .insert({
          fridge_item_id: itemAId,
          user_id: userBId,
          delta_percent: 25,
          remaining_after: 75,
        });
      expect(crossItemEventError).not.toBeNull();

      const { error: nonexistentItemEventError } = await clientB
        .from("consumption_events")
        .insert({
          fridge_item_id: "00000000-0000-4000-8000-000000000000",
          user_id: userBId,
          delta_percent: 25,
          remaining_after: 75,
        });
      expect(nonexistentItemEventError).not.toBeNull();
    } finally {
      if (itemAId) {
        const { error } = await clientA
          .from("fridge_items")
          .delete()
          .eq("id", itemAId);
        expect(error).toBeNull();
      }
      await Promise.all([
        clientA.auth.signOut({ scope: "local" }),
        clientB.auth.signOut({ scope: "local" }),
      ]);
    }
  });
});
