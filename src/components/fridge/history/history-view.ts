/**
 * Pure presenter for the item-history sheet: ItemHistory (frozen V2 shape) →
 * display rows. Extracted from the component (same pattern as add/scan-flow)
 * so empty/history/lineage states are unit-testable without a DOM.
 *
 * Vocabulary rules: level names come from the shared five-level labels
 * (Full/¾/½/¼/Finished — every surface speaks the same language), Consumed vs
 * Restored follows the signed-delta convention (positive = consumed,
 * negative = restored), and no UUID ever reaches a rendered string — ids are
 * React keys only.
 */

import { LEVEL_LABELS, LEVEL_PHRASES } from "@/lib/fridge/format";
import { latestRestoredAt } from "@/lib/history/derive";
import { historyDate, historyDateTime } from "@/lib/history/format";
import type { RemainingLevel } from "@/lib/types";
import type { ItemHistory, ItemHistoryEvent } from "@/lib/v2";

/* ─── View model ──────────────────────────────────────────────────────────── */

export interface HistoryFact {
  key:
    | "added"
    | "lastConsumed"
    | "lastRestored"
    | "finished"
    | "restocked"
    | "origin";
  label: string;
  value: string;
}

export type TimelineKind = "added" | "consumed" | "restored" | "finished";

export interface HistoryTimelineRow {
  /** React key (an event id or "added") — never rendered as text. */
  key: string;
  kind: TimelineKind;
  /** e.g. "Added — Full", "Consumed — ½", "Restored — ¾", "Finished". */
  text: string;
  /** e.g. "Today, 17:10" / "15 Aug 2026, 08:00". */
  timeLabel: string;
}

/** Progress of the lazy lineage-source fetch (second getItemHistory call). */
export interface LineageSourceState {
  loaded: boolean;
  /** The source unit's finished_at; null when it wasn't finished. */
  finishedAt: string | null;
}

export interface ItemHistoryView {
  facts: HistoryFact[];
  /** Oldest-first, always starting with the synthesized "Added" row. */
  timeline: HistoryTimelineRow[];
  /** False when the unit has no consumption events yet (empty state). */
  hasEvents: boolean;
}

/* ─── Builders ────────────────────────────────────────────────────────────── */

/** Sheet subtitle: "Half remaining", "Finished", … */
export function levelSummary(level: RemainingLevel): string {
  const phrase = LEVEL_PHRASES[level];
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

function timelineRow(event: ItemHistoryEvent, now: Date): HistoryTimelineRow {
  const timeLabel = historyDateTime(event.createdAt, now);
  if (event.remainingAfter === 0) {
    return { key: event.id, kind: "finished", text: "Finished", timeLabel };
  }
  const kind = event.deltaPercent > 0 ? "consumed" : "restored";
  const action = kind === "consumed" ? "Consumed" : "Restored";
  return {
    key: event.id,
    kind,
    text: `${action} — ${LEVEL_LABELS[event.remainingAfter]}`,
    timeLabel,
  };
}

function originValue(source: LineageSourceState | undefined): string {
  // Until the source unit's history arrives (or when the source was never
  // finished — e.g. a low unit restocked early), stay generic.
  if (source?.loaded && source.finishedAt) {
    return `Restocked from a unit finished on ${historyDate(source.finishedAt)}`;
  }
  return "Restocked from a previous unit";
}

export function buildItemHistoryView(
  history: ItemHistory,
  options: { now: Date; source?: LineageSourceState },
): ItemHistoryView {
  const { now, source } = options;

  const facts: HistoryFact[] = [
    {
      key: "added",
      label: "Added",
      value: historyDateTime(history.addedAt, now),
    },
  ];

  if (history.lastConsumedAt) {
    facts.push({
      key: "lastConsumed",
      label: "Last consumed",
      value: historyDateTime(history.lastConsumedAt, now),
    });
  }

  const restoredAt = latestRestoredAt(history.timeline);
  if (restoredAt) {
    facts.push({
      key: "lastRestored",
      label: "Last restored",
      value: historyDateTime(restoredAt, now),
    });
  }

  if (history.finishedAt) {
    facts.push({
      key: "finished",
      label: "Finished",
      value: historyDateTime(history.finishedAt, now),
    });
  }

  if (history.restockedAt) {
    // A finished historical unit that was later restocked: "Restocked on …"
    // rendered as the label/value pair every other fact uses.
    facts.push({
      key: "restocked",
      label: "Restocked on",
      value: historyDateTime(history.restockedAt, now),
    });
  }

  if (history.restockedFromItemId) {
    facts.push({ key: "origin", label: "Origin", value: originValue(source) });
  }

  const events = history.timeline
    .filter((event) => event.deltaPercent !== 0)
    .map((event) => timelineRow(event, now));

  return {
    facts,
    timeline: [
      {
        key: "added",
        kind: "added",
        text: "Added — Full",
        timeLabel: historyDateTime(history.addedAt, now),
      },
      ...events,
    ],
    hasEvents: events.length > 0,
  };
}
