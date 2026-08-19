/**
 * Server-side reads for the reminders section on /restock. Same pattern as
 * src/lib/fridge/queries.ts: cookie-bound client, RLS scopes rows to the
 * caller, no user filter in code.
 *
 * Server-only: imports the cookie-bound client (next/headers).
 */

import { createClient } from "@/lib/supabase/server";
import type { RestockReminder } from "@/lib/v2/types";

import {
  mapReminderRow,
  RESTOCK_REMINDER_SELECT,
  type RestockReminderRow,
} from "./mappers";

/**
 * All of the signed-in user's reminder schedules, oldest first.
 *
 * Returns null instead of throwing when the read fails — most likely because
 * the V2 foundation migration has not been applied to the target project yet
 * (docs/FEATURES_V2_PLAN.md §12.1). The MVP /restock content must keep
 * rendering in that state; the section hides itself.
 */
export async function fetchRestockReminders(): Promise<
  RestockReminder[] | null
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("restock_reminders")
    .select(RESTOCK_REMINDER_SELECT)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error("fetchRestockReminders failed:", error);
    return null;
  }

  return ((data ?? []) as unknown as RestockReminderRow[]).map(mapReminderRow);
}
