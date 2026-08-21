"use client";

import { useMemo, useState, useTransition } from "react";

import { useToast } from "@/components/app-shell/Toaster";
import { BellIcon, LoaderCircleIcon, MailIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/components/ui/utils";
import {
  EVERY_DAY,
  WEEKDAY_FULL_LABELS,
  WEEKDAY_SHORT_LABELS,
  WORKWEEK_SUN_THU,
} from "@/lib/reminders/format";
import { detectTimeZone, listTimeZones } from "@/lib/reminders/timezones";
import {
  createRestockReminder,
  updateRestockReminder,
} from "@/lib/v2/actions/reminders";
import type { RestockReminder, Weekday } from "@/lib/v2/types";

const HEADING_ID = "reminder-editor-heading";

/**
 * Create/edit form for one reminder schedule (bottom sheet on phones,
 * centered dialog from md up — the app's Modal primitive).
 *
 * The form body mounts only while the sheet is open, so every open starts
 * from fresh useState initializers (browser-detected zone and defaults for
 * "new", the row's values for "edit") — no state-syncing effects.
 */
export function ReminderEditorSheet({
  open,
  reminder,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null → create mode; a reminder → edit mode. */
  reminder: RestockReminder | null;
  onClose: () => void;
  onSaved: (saved: RestockReminder) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} labelledBy={HEADING_ID}>
      {open && (
        <ReminderForm reminder={reminder} onClose={onClose} onSaved={onSaved} />
      )}
    </Modal>
  );
}

function ReminderForm({
  reminder,
  onClose,
  onSaved,
}: {
  reminder: RestockReminder | null;
  onClose: () => void;
  onSaved: (saved: RestockReminder) => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  // Days are Sunday-first (the Israeli week); the Sun–Thu working week is
  // the friendliest default for the primary audience.
  const [days, setDays] = useState<Weekday[]>(() =>
    reminder ? [...reminder.daysOfWeek] : [...WORKWEEK_SUN_THU],
  );
  const [localTime, setLocalTime] = useState(() =>
    reminder ? reminder.localTime : "18:00",
  );
  const [timezone, setTimezone] = useState(() =>
    reminder ? reminder.timezone : detectTimeZone(),
  );
  const [emailEnabled, setEmailEnabled] = useState(
    () => reminder?.emailEnabled ?? true,
  );
  const [inAppEnabled, setInAppEnabled] = useState(
    () => reminder?.inAppEnabled ?? true,
  );
  const [attempted, setAttempted] = useState(false);

  const timezones = useMemo(
    () => listTimeZones(reminder ? [reminder.timezone] : []),
    [reminder],
  );

  const noDays = days.length === 0;
  const noTime = !/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime);
  // Channels are required whenever the schedule is (or stays) active.
  const activeAfterSave = reminder ? reminder.enabled : true;
  const noChannels = activeAfterSave && !emailEnabled && !inAppEnabled;
  const invalid = noDays || noTime || noChannels;

  function toggleDay(day: Weekday) {
    setDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  }

  function daysMatch(preset: readonly Weekday[]): boolean {
    return (
      days.length === preset.length && preset.every((day) => days.includes(day))
    );
  }

  function handleSave() {
    if (pending) return;
    if (invalid) {
      setAttempted(true);
      return;
    }
    startTransition(async () => {
      const result = reminder
        ? await updateRestockReminder({
            id: reminder.id,
            daysOfWeek: days,
            localTime,
            timezone,
            emailEnabled,
            inAppEnabled,
          })
        : await createRestockReminder({
            daysOfWeek: days,
            localTime,
            timezone,
            enabled: true,
            emailEnabled,
            inAppEnabled,
          });

      if (result.ok) {
        toast({
          message: reminder ? "Reminder updated" : "Reminder created",
        });
        onSaved(result.data);
      } else {
        toast({ message: result.error.message, tone: "destructive" });
      }
    });
  }

  return (
    <>
      <h2 id={HEADING_ID} className="text-lg font-semibold">
        {reminder ? "Edit reminder" : "New reminder"}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        We&apos;ll nudge you to check what needs restocking.
      </p>

      <div className="mt-5 space-y-5">
        {/* Days of week */}
        <fieldset>
          <div className="flex items-center justify-between">
            <legend className="text-sm font-medium">Days</legend>
            <div className="flex gap-1">
              <PresetChip
                label="Every day"
                active={daysMatch(EVERY_DAY)}
                onClick={() => setDays([...EVERY_DAY])}
              />
              <PresetChip
                label="Sun–Thu"
                active={daysMatch(WORKWEEK_SUN_THU)}
                onClick={() => setDays([...WORKWEEK_SUN_THU])}
              />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {WEEKDAY_SHORT_LABELS.map((label, index) => {
              const day = index as Weekday;
              const selected = days.includes(day);
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={selected}
                  aria-label={WEEKDAY_FULL_LABELS[index]}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "flex h-11 items-center justify-center rounded-md text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {attempted && noDays && (
            <p className="mt-2 text-xs text-destructive">
              Pick at least one day.
            </p>
          )}
        </fieldset>

        {/* Time + timezone */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Time</span>
            <Input
              type="time"
              value={localTime}
              onChange={(event) => setLocalTime(event.target.value)}
              className="mt-2"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Time zone</span>
            <select
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="mt-2 h-12 w-full rounded-md border border-input bg-card px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {timezones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
        {attempted && noTime && (
          <p className="-mt-3 text-xs text-destructive">
            Pick a time for the reminder.
          </p>
        )}

        {/* Channels */}
        <fieldset>
          <legend className="text-sm font-medium">Notify me via</legend>
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm">
                <MailIcon
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                Email
              </span>
              <Switch
                checked={emailEnabled}
                onCheckedChange={setEmailEnabled}
                ariaLabel="Email notifications"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm">
                <BellIcon
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                In-app notification
              </span>
              <Switch
                checked={inAppEnabled}
                onCheckedChange={setInAppEnabled}
                ariaLabel="In-app notifications"
              />
            </div>
          </div>
          {noChannels && (
            <p className="mt-2 text-xs text-destructive">
              An active reminder needs at least one channel.
            </p>
          )}
        </fieldset>
      </div>

      <div className="mt-6 flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={onClose}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button className="flex-1" onClick={handleSave} disabled={pending}>
          {pending ? (
            <>
              <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
              Saving…
            </>
          ) : reminder ? (
            "Save changes"
          ) : (
            "Create reminder"
          )}
        </Button>
      </div>
    </>
  );
}

function PresetChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150",
        active
          ? "bg-accent text-primary"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
