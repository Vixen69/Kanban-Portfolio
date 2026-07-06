// Card history for the detail modal — a readable projection of the event
// log (the log IS the history; nothing is stored elsewhere). Design v9
// narrates movements only (created / imported / moved), most recent
// first; blockages and comments have their own display surfaces.

import type { BoardConfig, CardEvent } from "./types.ts";

/** One movement in a card's life, ready for the detail modal list. */
export interface HistoryEntry {
  /** Column display name the card came from, null at creation/import. */
  fromName: string | null;
  /** Column display name the card arrived in ("Entrée" as a fallback). */
  toName: string;
  ts: string;
  actor: string;
}

const MOVEMENT_TYPES: ReadonlySet<CardEvent["type"]> = new Set(["created", "imported", "moved"]);

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

/**
 * The movement history of one card, most recent first.
 * Inputs: the full event list, the card id, the board config (column
 * display names). Only created/imported/moved events are narrated.
 * Output: HistoryEntry[] sorted by ts descending, ties broken by the
 * numeric suffix of the event id (the fold order, reversed). Unknown
 * column ids fall back to the raw id; a missing destination becomes
 * "Entrée"; created/imported entries always have fromName null.
 * Failure: none.
 */
export function cardHistory(events: CardEvent[], cardId: string, config: BoardConfig): HistoryEntry[] {
  return events
    .filter((event) => event.cardId === cardId && MOVEMENT_TYPES.has(event.type))
    .sort(newestFirst)
    .map((event) => ({
      fromName: event.type === "moved" ? columnName(config, event.fromColumn) : null,
      toName: columnName(config, event.toColumn) ?? ENTRY_LABEL,
      ts: event.ts,
      actor: event.actor,
    }));
}
