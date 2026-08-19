import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  e2eEnvironment,
  hasServiceRole,
  hasTwoUsers,
} from "./support/environment";
import {
  createUserClient,
  userACredentials,
  userBCredentials,
} from "./support/supabase";

/**
 * F2 RLS matrix (docs/FEATURES_V2_PLAN.md §7): restock_reminders rows are
 * owner-only for every verb; notifications are readable/markable by their
 * owner but can never be inserted by an ordinary (authenticated) client —
 * only the Edge Function's service role creates them.
 *
 * Same conventions as e2e/permissions.spec.ts: anon-key clients signed in as
 * the two pre-created E2E users, RLS misses surfacing as empty result sets
 * (no existence oracle), grant misses as errors.
 */
test.describe("@rls restock reminders + notifications isolation", () => {
  test.skip(
    !hasTwoUsers,
    "Requires Supabase and pre-created credentials for E2E users A and B.",
  );

  test("User B cannot read, update, delete, or forge User A's reminders", async () => {
    const clientA = await createUserClient(userACredentials());
    const clientB = await createUserClient(userBCredentials());
    let reminderAId: string | undefined;

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

      // Owner can create their own schedule.
      const { data: reminderA, error: createError } = await clientA
        .from("restock_reminders")
        .insert({
          user_id: userAId,
          days_of_week: [0, 3],
          local_time: "18:30",
          timezone: "Asia/Jerusalem",
          enabled: true,
          email_enabled: true,
          in_app_enabled: true,
        })
        .select("id")
        .single();
      expect(createError).toBeNull();
      reminderAId = reminderA!.id as string;

      // Foreign SELECT: invisible, not an error (no existence oracle).
      const { data: foreignRead, error: foreignReadError } = await clientB
        .from("restock_reminders")
        .select("id")
        .eq("id", reminderAId);
      expect(foreignReadError).toBeNull();
      expect(foreignRead).toEqual([]);

      // Foreign UPDATE / DELETE: zero rows touched.
      const { data: foreignUpdate, error: foreignUpdateError } = await clientB
        .from("restock_reminders")
        .update({ enabled: false })
        .eq("id", reminderAId)
        .select("id");
      expect(foreignUpdateError).toBeNull();
      expect(foreignUpdate).toEqual([]);

      const { data: foreignDelete, error: foreignDeleteError } = await clientB
        .from("restock_reminders")
        .delete()
        .eq("id", reminderAId)
        .select("id");
      expect(foreignDeleteError).toBeNull();
      expect(foreignDelete).toEqual([]);

      // Impersonation: B may not insert a reminder owned by A.
      const { error: impersonationError } = await clientB
        .from("restock_reminders")
        .insert({
          user_id: userAId,
          days_of_week: [1],
          local_time: "09:00",
          timezone: "UTC",
          enabled: true,
          email_enabled: false,
          in_app_enabled: true,
        });
      expect(impersonationError).not.toBeNull();

      // Scheduler bookkeeping: last_sent_key is worker-owned. Since
      // 20260819000000_v2_reminder_column_privileges.sql the UPDATE grant is
      // column-scoped, so even the OWNER writing it is a grant miss (42501),
      // not a silent no-op.
      const { error: ownerBookkeepingError } = await clientA
        .from("restock_reminders")
        .update({ last_sent_key: "2099-01-01" })
        .eq("id", reminderAId)
        .select("id");
      expect(ownerBookkeepingError).not.toBeNull();
      expect(ownerBookkeepingError!.code).toBe("42501");

      // Same for smuggling it into an otherwise-valid INSERT.
      const { error: insertBookkeepingError } = await clientA
        .from("restock_reminders")
        .insert({
          user_id: userAId,
          days_of_week: [2],
          local_time: "08:00",
          timezone: "UTC",
          enabled: true,
          email_enabled: false,
          in_app_enabled: true,
          last_sent_key: "2099-01-01",
        })
        .select("id");
      expect(insertBookkeepingError).not.toBeNull();
      expect(insertBookkeepingError!.code).toBe("42501");

      // Owner still sees the row untouched by all of the above.
      const { data: ownRead, error: ownReadError } = await clientA
        .from("restock_reminders")
        .select("enabled")
        .eq("id", reminderAId)
        .single();
      expect(ownReadError).toBeNull();
      expect(ownRead?.enabled).toBe(true);

      // Owner can update their own schedule.
      const { data: ownUpdate, error: ownUpdateError } = await clientA
        .from("restock_reminders")
        .update({ enabled: false })
        .eq("id", reminderAId)
        .select("enabled");
      expect(ownUpdateError).toBeNull();
      expect(ownUpdate).toEqual([{ enabled: false }]);
    } finally {
      if (reminderAId) {
        const { error } = await clientA
          .from("restock_reminders")
          .delete()
          .eq("id", reminderAId);
        expect(error).toBeNull();
      }
      await Promise.all([clientA.auth.signOut(), clientB.auth.signOut()]);
    }
  });

  test("ordinary users cannot forge notification rows — not even their own", async () => {
    const clientA = await createUserClient(userACredentials());
    const clientB = await createUserClient(userBCredentials());

    try {
      const [{ data: authA }, { data: authB }] = await Promise.all([
        clientA.auth.getUser(),
        clientB.auth.getUser(),
      ]);
      const userAId = authA.user?.id;
      const userBId = authB.user?.id;

      // Self-forgery: the authenticated role has no INSERT policy/grant.
      const { error: selfForgeryError } = await clientA
        .from("notifications")
        .insert({
          user_id: userAId,
          type: "restock_reminder",
          title: "Forged",
          body: "Should never exist",
        });
      expect(selfForgeryError).not.toBeNull();

      // Cross-user forgery fails the same way.
      const { error: crossForgeryError } = await clientB
        .from("notifications")
        .insert({
          user_id: userAId,
          type: "restock_reminder",
          title: "Forged for someone else",
          body: "Should never exist either",
        });
      expect(crossForgeryError).not.toBeNull();

      // B fishing for A's notifications sees nothing (whatever exists).
      const { data: foreignList, error: foreignListError } = await clientB
        .from("notifications")
        .select("id")
        .eq("user_id", userAId!);
      expect(foreignListError).toBeNull();
      expect(foreignList).toEqual([]);

      void userBId;
    } finally {
      await Promise.all([clientA.auth.signOut(), clientB.auth.signOut()]);
    }
  });

  test("server-created notifications: owner reads + marks read; strangers cannot; only read_at is writable", async () => {
    test.skip(
      !hasServiceRole,
      "Requires SUPABASE_SERVICE_ROLE_KEY (local stack) to seed a worker-created notification.",
    );

    const service = createClient(
      e2eEnvironment.supabaseUrl!,
      e2eEnvironment.supabaseServiceRoleKey!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const clientA = await createUserClient(userACredentials());
    const clientB = await createUserClient(userBCredentials());
    let notificationId: string | undefined;

    try {
      const { data: authA } = await clientA.auth.getUser();
      const userAId = authA.user?.id;
      expect(userAId).toBeTruthy();

      // Seed exactly the way the Edge Function worker does: service role.
      const { data: seeded, error: seedError } = await service
        .from("notifications")
        .insert({
          user_id: userAId,
          type: "restock_reminder",
          title: "Time to check what needs restocking",
          body: "E2E seeded notification",
          metadata: { source: "e2e" },
        })
        .select("id")
        .single();
      expect(seedError).toBeNull();
      notificationId = seeded!.id as string;

      // Stranger: invisible to read, zero rows on mark-read.
      const { data: foreignRead, error: foreignReadError } = await clientB
        .from("notifications")
        .select("id")
        .eq("id", notificationId);
      expect(foreignReadError).toBeNull();
      expect(foreignRead).toEqual([]);

      const { data: foreignMark, error: foreignMarkError } = await clientB
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notificationId)
        .select("id");
      expect(foreignMarkError).toBeNull();
      expect(foreignMark).toEqual([]);

      // Owner: sees it unread, may rewrite ONLY read_at…
      const { data: ownRead, error: ownReadError } = await clientA
        .from("notifications")
        .select("read_at")
        .eq("id", notificationId)
        .single();
      expect(ownReadError).toBeNull();
      expect(ownRead?.read_at).toBeNull();

      const { error: titleRewriteError } = await clientA
        .from("notifications")
        .update({ title: "Rewritten history" })
        .eq("id", notificationId)
        .select("id");
      expect(titleRewriteError).not.toBeNull(); // column grant is read_at-only

      const { data: marked, error: markError } = await clientA
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notificationId)
        .select("read_at");
      expect(markError).toBeNull();
      expect(marked).toHaveLength(1);
      expect(marked![0].read_at).not.toBeNull();
    } finally {
      if (notificationId) {
        const { error } = await service
          .from("notifications")
          .delete()
          .eq("id", notificationId);
        expect(error).toBeNull();
      }
      await Promise.all([clientA.auth.signOut(), clientB.auth.signOut()]);
    }
  });
});
