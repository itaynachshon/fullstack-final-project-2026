"use server";

/**
 * F2 contract — in-app notification read state. Stub bodies; F2 replaces them
 * in this file only. Inserting notifications is a server/cron privilege, not
 * a client action (docs/FEATURES_V2_PLAN.md §7).
 */

import { notImplemented } from "@/lib/v2/not-implemented";
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
  return notImplemented("Notifications");
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
  return notImplemented("Notifications");
}
