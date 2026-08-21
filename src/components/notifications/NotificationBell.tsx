"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";

import { BellIcon, LoaderCircleIcon, XIcon } from "@/components/icons";
import { cn } from "@/components/ui/utils";
import { relativeTime } from "@/lib/fridge/format";
import {
  listNotifications,
  markNotificationRead,
} from "@/lib/v2/actions/notifications";
import { ROUTES } from "@/lib/routes";
import type { Notification } from "@/lib/v2/types";

/** Background refresh cadence while the tab is visible. */
const POLL_MS = 60_000;

/**
 * Bell + unread badge + notification panel (F2). Server actions are the only
 * data path — rows are created exclusively by the restock-reminders Edge
 * Function, so this component is read/mark-read only.
 *
 * The panel is a lightweight popover, not a <dialog>: anchored under the
 * bell from md up, near-full-width sheet under the top bar on phones. A
 * transparent fixed backdrop catches outside taps; Esc closes.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[] | null>(null);
  const [, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await listNotifications({});
      // Errors keep the last list: a bell that silently misses a beat is
      // better than one that flashes red in the shell chrome.
      if (result.ok) {
        setItems((current) => {
          // Merge, don't replace: a response that was already in flight when
          // the user tapped "mark read" must not resurrect the row as unread
          // (found against real hosted latency). Server-read always wins;
          // locally-read survives until the server confirms it.
          const locallyRead = new Map(
            (current ?? [])
              .filter((item) => item.readAt !== null)
              .map((item) => [item.id, item.readAt]),
          );
          return result.data.map((row) =>
            row.readAt !== null
              ? row
              : { ...row, readAt: locallyRead.get(row.id) ?? null },
          );
        });
      }
    });
  }, []);

  // Initial load + background poll (skipped while the tab is hidden).
  useEffect(() => {
    refresh();
    const interval = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, POLL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  // Esc closes while the panel is open.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const unread = (items ?? []).filter((item) => !item.readAt);
  const unreadCount = unread.length;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) refresh();
  }

  function markRead(id: string) {
    // Optimistic: the row flips instantly; a failure flips it back.
    setItems(
      (current) =>
        current?.map((item) =>
          item.id === id && !item.readAt
            ? { ...item, readAt: new Date().toISOString() }
            : item,
        ) ?? null,
    );
    startTransition(async () => {
      const result = await markNotificationRead({ id });
      if (!result.ok) {
        setItems(
          (current) =>
            current?.map((item) =>
              item.id === id ? { ...item, readAt: null } : item,
            ) ?? null,
        );
      }
    });
  }

  function markAllRead() {
    const ids = unread.map((item) => item.id);
    setItems(
      (current) =>
        current?.map((item) =>
          item.readAt ? item : { ...item, readAt: new Date().toISOString() },
        ) ?? null,
    );
    startTransition(async () => {
      // Sequential, not Promise.all — a handful of rows at most, and this
      // avoids hammering the action endpoint in a burst.
      for (const id of ids) {
        await markNotificationRead({ id });
      }
      refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        className="relative flex size-11 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150"
      >
        <BellIcon className="size-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Outside-tap catcher; sits under the panel, over the page. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-transparent"
          />
          <div
            role="dialog"
            aria-label="Notifications"
            className="fixed inset-x-3 top-14 z-50 overflow-hidden rounded-xl border border-border bg-card shadow-lg md:absolute md:inset-x-auto md:top-[calc(100%+8px)] md:right-0 md:w-96"
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <h2 className="text-sm font-semibold">Notifications</h2>
              {unreadCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {unreadCount} unread
                </span>
              )}
              <div className="ml-auto flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="rounded-full px-2 py-1.5 text-xs font-medium text-primary outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close notifications"
                  className="flex size-8 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:hidden"
                >
                  <XIcon className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="max-h-[60dvh] overflow-y-auto md:max-h-96">
              {items === null ? (
                <div className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-muted-foreground">
                  <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
                  Loading…
                </div>
              ) : items.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <BellIcon
                    className="mx-auto size-6 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="mt-2 text-sm font-medium">Nothing here yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Restock reminders you set up will land here.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {items.map((item) => (
                    <NotificationRow
                      key={item.id}
                      item={item}
                      onMarkRead={markRead}
                    />
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-border px-4 py-2">
              <Link
                href={ROUTES.restock}
                onClick={() => setOpen(false)}
                className="text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                Go to Restock →
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NotificationRow({
  item,
  onMarkRead,
}: {
  item: Notification;
  onMarkRead: (id: string) => void;
}) {
  const isUnread = !item.readAt;
  return (
    <li>
      <button
        type="button"
        onClick={() => isUnread && onMarkRead(item.id)}
        aria-label={isUnread ? `Mark as read: ${item.title}` : item.title}
        className={cn(
          "flex w-full items-start gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          isUnread ? "bg-accent/40 hover:bg-accent/60" : "hover:bg-accent/30",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "mt-1.5 size-2 shrink-0 rounded-full",
            isUnread ? "bg-primary" : "bg-transparent",
          )}
        />
        <span className="min-w-0 flex-1">
          <span
            dir="auto"
            className={cn(
              "block truncate text-sm",
              isUnread ? "font-semibold" : "font-medium",
            )}
          >
            {item.title}
          </span>
          {item.body && (
            <span
              dir="auto"
              className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground"
            >
              {item.body}
            </span>
          )}
          <span className="mt-1 block text-[11px] text-muted-foreground">
            {relativeTime(item.createdAt, new Date())}
          </span>
        </span>
      </button>
    </li>
  );
}
