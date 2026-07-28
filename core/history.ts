// Card history for the detail modal — a readable projection of the event
// log (the log IS the history; nothing is stored elsewhere). Design v11
// narrates movements (created / imported / moved) AND blockages (blocked /
// unblocked, with the motif), most recent first; comments keep their own
// display surface.

import type { BoardConfig, CardEvent } from "./types.ts";
import { isReorder } from "./events.ts";

/** What a history line narrates — a movement or a blocking event. */
export type HistoryKind = "move" | "block" | "unblock";

/** One entry in a card's history, ready for the detail modal list. */
export interface HistoryEntry {
  kind: HistoryKind;
  /** Column display name the card came from — movements only. */
  fromName: string | null;
  /** Column display name the card arrived in ("Entrée" fallback) — movements only. */
  toName: string | null;
  /** Blocking motif — block lines only (null when none was recorded). */
  reason: string | null;
  ts: string;
  actor: string;
}

const NARRATED_TYPES: ReadonlySet<CardEvent["type"]> = new Set(["created", "imported", "moved", "blocked", "unblocked"]);

/** French fallback when an event carries no destination column at all. */
const ENTRY_LABEL = "Entrée";

function columnName(config: BoardConfig, columnId: string | null): string | null {
  if (columnId === null || columnId === "") return null;
  return config.columns.find((column) => column.id === columnId)?.name ?? columnId;
}

function numericSuffix(eventId: string): number {
  const match = /(\d+)$/.exec(eventId);
  return match ? Number(match[1]) : 0;
}

function newestFirst(a: CardEvent, b: CardEvent): number {
  if (a.ts !== b.ts) return a.ts < b.ts ? 1 : -1;
  return numericSuffix(b.id) - numericSuffix(a.id);
}

function toEntry(config: BoardConfig, event: CardEvent): HistoryEntry {
  const base = { fromName: null, toName: null, reason: null, ts: event.ts, actor: event.actor };
  if (event.type === "blocked") {
    const reason = event.payload["reason"];
    return { ...base, kind: "block", reason: typeof reason === "string" ? reason : null };
  }
  if (event.type === "unblocked") return { ...base, kind: "unblock" };
  return {
    ...base,
    kind: "move",
    fromName: event.type === "moved" ? columnName(config, event.fromColumn) : null,
    toName: columnName(config, event.toColumn) ?? ENTRY_LABEL,
  };
}

/**
 * The history of one card, most recent first.
 * Inputs: the full event list, the card id, the board config (column
 * display names). Narrated events: created/imported/moved (kind "move"),
 * blocked (kind "block", with the motif from the payload) and unblocked
 * (kind "unblock").
 * Output: HistoryEntry[] sorted by ts descending, ties broken by the
 * numeric suffix of the event id (the fold order, reversed). Unknown
 * column ids fall back to the raw id; a missing destination becomes
 * "Entrée"; created/imported entries always have fromName null; block and
 * unblock entries carry no columns. Same-cell reorders (ADR 019) are not
 * movements and are not narrated. Failure: none.
 */
export function cardHistory(events: CardEvent[], cardId: string, config: BoardConfig): HistoryEntry[] {
  return events
    .filter((event) => event.cardId === cardId && NARRATED_TYPES.has(event.type) && !isReorder(event))
    .sort(newestFirst)
    .map((event) => toEntry(config, event));
}
