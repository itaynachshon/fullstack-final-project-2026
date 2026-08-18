"use server";

/**
 * F2 contract — restock reminder CRUD. Stub bodies; F2 replaces them in this
 * file only (docs/FEATURES_V2_PLAN.md §5.3). lastSentKey is never accepted
 * from these inputs.
 */

import { notImplemented } from "@/lib/v2/not-implemented";
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

export async function listRestockReminders(): Promise<
  V2ActionResult<RestockReminder[]>
> {
  return notImplemented("Restock reminders");
}

export async function createRestockReminder(
  input: CreateRestockReminderInput,
): Promise<V2ActionResult<RestockReminder>> {
  const parsed = createRestockReminderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation", message: "Invalid input." },
    };
  }
  return notImplemented("Restock reminders");
}

export async function updateRestockReminder(
  input: UpdateRestockReminderInput,
): Promise<V2ActionResult<RestockReminder>> {
  const parsed = updateRestockReminderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation", message: "Invalid input." },
    };
  }
  return notImplemented("Restock reminders");
}

export async function deleteRestockReminder(
  input: DeleteRestockReminderInput,
): Promise<V2ActionResult<DeleteRestockReminderData>> {
  const parsed = deleteRestockReminderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation", message: "Invalid input." },
    };
  }
  return notImplemented("Restock reminders");
}
