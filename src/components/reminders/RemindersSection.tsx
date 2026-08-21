"use client";

import { useState, useTransition } from "react";

import { useToast } from "@/components/app-shell/Toaster";
import {
  AlarmClockIcon,
  BellIcon,
  LoaderCircleIcon,
  MailIcon,
  PencilLineIcon,
  PlusIcon,
  Trash2Icon,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/components/ui/utils";
import {
  formatDaysOfWeek,
  formatDaysOfWeekLong,
  formatTimeZoneLabel,
} from "@/lib/reminders/format";
import {
  deleteRestockReminder,
  updateRestockReminder,
} from "@/lib/v2/actions/reminders";
import type { RestockReminder } from "@/lib/v2/types";

import { ReminderEditorSheet } from "./ReminderEditorSheet";

/**
 * "Remind me to restock" (F2) — schedule list + editor + delete confirm.
 *
 * Server page passes the initial rows; afterwards this component keeps its
 * own copy in state, updated from action results (each action returns the
 * fresh row, so no refetch round-trip is needed for instant feedback).
 * When `initialReminders` is null the reminders table is unreachable (V2
 * migration not applied yet) and the section renders nothing rather than a
 * broken card — the MVP restock checklist above stays fully usable.
 */
export function RemindersSection({
  initialReminders,
}: {
  initialReminders: RestockReminder[] | null;
}) {
  const [reminders, setReminders] = useState<RestockReminder[]>(
    initialReminders ?? [],
  );
  const [editor, setEditor] = useState<
    { open: false } | { open: true; reminder: RestockReminder | null }
  >({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<RestockReminder | null>(
    null,
  );

  if (initialReminders === null) return null;

  const enabledCount = reminders.filter((reminder) => reminder.enabled).length;

  function handleSaved(saved: RestockReminder) {
    setReminders((current) => {
      const exists = current.some((reminder) => reminder.id === saved.id);
      return exists
        ? current.map((reminder) =>
            reminder.id === saved.id ? saved : reminder,
          )
        : [...current, saved];
    });
    setEditor({ open: false });
  }

  function handlePatched(patched: RestockReminder) {
    setReminders((current) =>
      current.map((reminder) =>
        reminder.id === patched.id ? patched : reminder,
      ),
    );
  }

  function handleDeleted(id: string) {
    setReminders((current) => current.filter((reminder) => reminder.id !== id));
    setDeleteTarget(null);
  }

  return (
    <section aria-labelledby="restock-reminders-heading" className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <AlarmClockIcon
          className="size-5 text-muted-foreground"
          aria-hidden="true"
        />
        <h2 id="restock-reminders-heading" className="text-base font-semibold">
          Remind me to restock
        </h2>
        {enabledCount > 0 && <Badge variant="muted">{enabledCount} on</Badge>}
        <Button
          variant="secondary"
          onClick={() => setEditor({ open: true, reminder: null })}
          className="ml-auto h-9 px-3 text-xs"
        >
          <PlusIcon className="size-4" aria-hidden="true" />
          New
        </Button>
      </div>

      {reminders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
          <p className="text-sm font-medium">No reminders yet</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
            Pick days and a time — we&apos;ll send you what&apos;s running low
            by email or in-app, in your own time zone.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {reminders.map((reminder) => (
            <ReminderCard
              key={reminder.id}
              reminder={reminder}
              onEdit={() => setEditor({ open: true, reminder })}
              onDelete={() => setDeleteTarget(reminder)}
              onPatched={handlePatched}
            />
          ))}
        </ul>
      )}

      <ReminderEditorSheet
        open={editor.open}
        reminder={editor.open ? editor.reminder : null}
        onClose={() => setEditor({ open: false })}
        onSaved={handleSaved}
      />

      <DeleteReminderDialog
        reminder={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={handleDeleted}
      />
    </section>
  );
}

function ReminderCard({
  reminder,
  onEdit,
  onDelete,
  onPatched,
}: {
  reminder: RestockReminder;
  onEdit: () => void;
  onDelete: () => void;
  onPatched: (patched: RestockReminder) => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const daysLabel = formatDaysOfWeek(reminder.daysOfWeek);
  const daysLong = formatDaysOfWeekLong(reminder.daysOfWeek);
  const zoneLabel = formatTimeZoneLabel(reminder.timezone, new Date());

  function handleToggle(enabled: boolean) {
    startTransition(async () => {
      const result = await updateRestockReminder({
        id: reminder.id,
        enabled,
      });
      if (result.ok) {
        onPatched(result.data);
        toast({
          message: enabled ? "Reminder turned on" : "Reminder turned off",
        });
      } else {
        toast({ message: result.error.message, tone: "destructive" });
      }
    });
  }

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3",
        !reminder.enabled && "opacity-70",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tabular-nums">
            {reminder.localTime}
          </span>
          <span className="truncate text-sm text-muted-foreground">
            {daysLabel}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {zoneLabel}
        </p>
        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
          <span
            className={cn(
              "flex items-center gap-1",
              !reminder.emailEnabled && "line-through opacity-50",
            )}
          >
            <MailIcon className="size-3.5" aria-hidden="true" />
            Email
          </span>
          <span
            className={cn(
              "flex items-center gap-1",
              !reminder.inAppEnabled && "line-through opacity-50",
            )}
          >
            <BellIcon className="size-3.5" aria-hidden="true" />
            In-app
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onEdit}
          aria-label={`Edit reminder for ${daysLong} at ${reminder.localTime}`}
        >
          <PencilLineIcon className="size-4" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label={`Delete reminder for ${daysLong} at ${reminder.localTime}`}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2Icon className="size-4" aria-hidden="true" />
        </Button>
        <Switch
          checked={reminder.enabled}
          onCheckedChange={handleToggle}
          disabled={pending}
          ariaLabel={`Reminder for ${daysLong} at ${reminder.localTime}`}
          className="ml-1"
        />
      </div>
    </li>
  );
}

function DeleteReminderDialog({
  reminder,
  onClose,
  onDeleted,
}: {
  reminder: RestockReminder | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!reminder || pending) return;
    const { id } = reminder;
    startTransition(async () => {
      const result = await deleteRestockReminder({ id });
      if (result.ok) {
        toast({ message: "Reminder deleted" });
        onDeleted(id);
      } else {
        toast({ message: result.error.message, tone: "destructive" });
        onClose();
      }
    });
  }

  return (
    <Modal
      open={reminder !== null}
      onClose={onClose}
      variant="dialog"
      labelledBy="delete-reminder-heading"
    >
      <h2 id="delete-reminder-heading" className="text-lg font-semibold">
        Delete this reminder?
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {reminder
          ? `${formatDaysOfWeek(reminder.daysOfWeek)} at ${reminder.localTime} — this can't be undone.`
          : ""}
      </p>
      <div className="mt-5 flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={onClose}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          onClick={handleDelete}
          disabled={pending}
        >
          {pending ? (
            <>
              <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
              Deleting…
            </>
          ) : (
            "Delete"
          )}
        </Button>
      </div>
    </Modal>
  );
}
