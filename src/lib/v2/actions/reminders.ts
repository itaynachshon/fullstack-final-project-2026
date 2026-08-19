"use server";

/**
 * F2 — restock reminder CRUD (real bodies replacing the F0 stubs; this file
 * is the one F2 owns per docs/FEATURES_V2_PLAN.md §5.3).
 *
 * Same audited pattern as the MVP actions (src/lib/actions/fridge.ts):
 * auth check → Zod parse → DB write under RLS → revalidatePath → result.
 * `user_id` always comes from the server session; `lastSentKey` is absent
 * from every input schema, so a client can never smuggle scheduler state —
 * only the Edge Function worker (service role) writes it.
 */

import { revalidatePath } from "next/cache";

import {
  mapReminderRow,
  RESTOCK_REMINDER_SELECT,
  type RestockReminderRow,
} from "@/lib/reminders/mappers";
import { ROUTES } from "@/lib/routes";
import { fieldErrorsOf } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import {
  createRestockReminderSchema,
  deleteRestockReminderSchema,
  updateRestockReminderSchema,
} from "@/lib/v2/schemas";
import type {
  CreateRestockReminderInput,
  DeleteRestockReminderData,
  DeleteRestockReminderInput,
  RestockReminder,
  UpdateRestockReminderInput,
  V2ActionResult,
} from "@/lib/v2/types";
import type { z } from "zod";

/** Postgres CHECK violation (e.g. enabled reminder with both channels off). */
const CHECK_VIOLATION = "23514";

const CHANNELS_MESSAGE =
  "Enable email or in-app notifications when the reminder is on.";

export async function listRestockReminders(): Promise<
  V2ActionResult<RestockReminder[]>
> {
  const gate = await requireUser();
  if (!gate.ok) return gate.failure;

  const { data, error } = await gate.supabase
    .from("restock_reminders")
    .select(RESTOCK_REMINDER_SELECT)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) return internal("listRestockReminders failed", error);
  return {
    ok: true,
    data: ((data ?? []) as unknown as RestockReminderRow[]).map(mapReminderRow),
  };
}

export async function createRestockReminder(
  input: CreateRestockReminderInput,
): Promise<V2ActionResult<RestockReminder>> {
  const gate = await requireUserAndParse(createRestockReminderSchema, input);
  if (!gate.ok) return gate.failure;
  const { supabase, userId, data } = gate;

  const { data: inserted, error } = await supabase
    .from("restock_reminders")
    .insert({
      user_id: userId,
      days_of_week: data.daysOfWeek,
      local_time: data.localTime,
      timezone: data.timezone,
      enabled: data.enabled,
      email_enabled: data.emailEnabled,
      in_app_enabled: data.inAppEnabled,
    })
    .select(RESTOCK_REMINDER_SELECT)
    .single();

  if (error || !inserted) {
    if (isCheckViolation(error)) return validation(CHANNELS_MESSAGE);
    return internal("createRestockReminder insert failed", error);
  }

  revalidatePath(ROUTES.restock);
  return {
    ok: true,
    data: mapReminderRow(inserted as unknown as RestockReminderRow),
  };
}

export async function updateRestockReminder(
  input: UpdateRestockReminderInput,
): Promise<V2ActionResult<RestockReminder>> {
  const gate = await requireUserAndParse(updateRestockReminderSchema, input);
  if (!gate.ok) return gate.failure;
  const { supabase, data } = gate;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (data.daysOfWeek !== undefined) patch.days_of_week = data.daysOfWeek;
  if (data.localTime !== undefined) patch.local_time = data.localTime;
  if (data.timezone !== undefined) patch.timezone = data.timezone;
  if (data.enabled !== undefined) patch.enabled = data.enabled;
  if (data.emailEnabled !== undefined) patch.email_enabled = data.emailEnabled;
  if (data.inAppEnabled !== undefined) patch.in_app_enabled = data.inAppEnabled;

  const { data: updated, error } = await supabase
    .from("restock_reminders")
    .update(patch)
    .eq("id", data.id)
    .select(RESTOCK_REMINDER_SELECT);

  if (error) {
    // The DB CHECK guards the MERGED row (e.g. re-enabling a reminder whose
    // stored channels are both off) — cases per-field Zod cannot see.
    if (isCheckViolation(error)) return validation(CHANNELS_MESSAGE);
    return internal("updateRestockReminder failed", error);
  }
  if (!updated || updated.length === 0) {
    return notFound("That reminder doesn't exist.");
  }

  revalidatePath(ROUTES.restock);
  return {
    ok: true,
    data: mapReminderRow(updated[0] as unknown as RestockReminderRow),
  };
}

export async function deleteRestockReminder(
  input: DeleteRestockReminderInput,
): Promise<V2ActionResult<DeleteRestockReminderData>> {
  const gate = await requireUserAndParse(deleteRestockReminderSchema, input);
  if (!gate.ok) return gate.failure;
  const { supabase, data } = gate;

  const { data: deleted, error } = await supabase
    .from("restock_reminders")
    .delete()
    .eq("id", data.id)
    .select("id");

  if (error) return internal("deleteRestockReminder failed", error);
  if (!deleted || deleted.length === 0) {
    return notFound("That reminder doesn't exist.");
  }

  revalidatePath(ROUTES.restock);
  return { ok: true, data: { id: data.id } };
}

/* ─── Shared internals ('use server' files may only export async actions) ─── */

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

type Gate<T> =
  | { ok: true; data: T; supabase: ServerSupabase; userId: string }
  | { ok: false; failure: V2ActionResult<never> };

async function requireUserAndParse<S extends z.ZodType>(
  schema: S,
  input: unknown,
): Promise<Gate<z.infer<S>>> {
  const gate = await requireUser();
  if (!gate.ok) return gate;

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      failure: {
        ok: false,
        error: {
          code: "validation",
          message: "Invalid input.",
          fieldErrors: fieldErrorsOf(parsed.error),
        },
      },
    };
  }
  return {
    ok: true,
    data: parsed.data,
    supabase: gate.supabase,
    userId: gate.userId,
  };
}

function isCheckViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === CHECK_VIOLATION
  );
}

function validation(message: string): V2ActionResult<never> {
  return { ok: false, error: { code: "validation", message } };
}

function notFound(message: string): V2ActionResult<never> {
  return { ok: false, error: { code: "not_found", message } };
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
