"use server";

/**
 * F2 — in-app notification read state (real bodies replacing the F0 stubs).
 *
 * Reads and the read_at update run under RLS with the caller's JWT. Inserting
 * notifications is impossible here by design: the authenticated role has no
 * INSERT policy or grant (20260818000000_v2_foundation.sql) — rows are
 * created only by the restock-reminders Edge Function with the service role.
 * The UPDATE below can touch only `read_at` (column-level grant).
 */

import {
  mapNotificationRow,
  NOTIFICATION_SELECT,
  type NotificationRow,
} from "@/lib/reminders/mappers";
import { createClient } from "@/lib/supabase/server";
import {
  listNotificationsSchema,
  markNotificationReadSchema,
} from "@/lib/v2/schemas";
import type {
  ListNotificationsInput,
  MarkNotificationReadData,
  MarkNotificationReadInput,
  Notification,
  V2ActionResult,
} from "@/lib/v2/types";

/** Bell dropdowns don't paginate; the newest 50 are plenty for this scale. */
const LIST_LIMIT = 50;

export async function listNotifications(
  input: ListNotificationsInput = {},
): Promise<V2ActionResult<Notification[]>> {
  const parsed = listNotificationsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation", message: "Invalid input." },
    };
  }

  const gate = await requireUser();
  if (!gate.ok) return gate.failure;

  let query = gate.supabase
    .from("notifications")
    .select(NOTIFICATION_SELECT)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(LIST_LIMIT);
  if (parsed.data.unreadOnly) {
    query = query.is("read_at", null);
  }

  const { data, error } = await query;
  if (error) return internal("listNotifications failed", error);

  return {
    ok: true,
    data: ((data ?? []) as unknown as NotificationRow[]).map(
      mapNotificationRow,
    ),
  };
}

export async function markNotificationRead(
  input: MarkNotificationReadInput,
): Promise<V2ActionResult<MarkNotificationReadData>> {
  const parsed = markNotificationReadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation", message: "Invalid input." },
    };
  }

  const gate = await requireUser();
  if (!gate.ok) return gate.failure;
  const { supabase } = gate;
  const { id } = parsed.data;

  // RLS makes a foreign id invisible — indistinguishable from nonexistent.
  const { data: existing, error: readError } = await supabase
    .from("notifications")
    .select("id, read_at")
    .eq("id", id)
    .maybeSingle();

  if (readError) return internal("markNotificationRead read failed", readError);
  if (!existing) {
    return {
      ok: false,
      error: { code: "not_found", message: "That notification doesn't exist." },
    };
  }

  // Already read: keep the original timestamp (marking read is idempotent).
  if (existing.read_at) {
    return { ok: true, data: { id, readAt: existing.read_at as string } };
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("notifications")
    .update({ read_at: nowIso }) // the ONLY column authenticated may write
    .eq("id", id)
    .select("id, read_at");

  if (updateError) {
    return internal("markNotificationRead update failed", updateError);
  }
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error: { code: "not_found", message: "That notification doesn't exist." },
    };
  }

  return {
    ok: true,
    data: { id, readAt: (updated[0].read_at as string) ?? nowIso },
  };
}

/* ─── Shared internals ────────────────────────────────────────────────────── */

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

type UserGate =
  | { ok: true; supabase: ServerSupabase; userId: string }
  | { ok: false; failure: V2ActionResult<never> };

async function requireUser(): Promise<UserGate> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      failure: {
        ok: false,
        error: {
          code: "unauthenticated",
          message: "You must be signed in to do that.",
        },
      },
    };
  }
  return { ok: true, supabase, userId: user.id };
}

/** Logs the raw error server-side; the user sees only a generic message. */
function internal(context: string, error: unknown): V2ActionResult<never> {
  console.error(`${context}:`, error);
  return {
    ok: false,
    error: {
      code: "internal",
      message: "Something went wrong on our side — try again.",
    },
  };
}
