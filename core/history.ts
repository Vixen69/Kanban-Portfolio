// Card history for the detail modal — a readable projection of the event
// log (the log IS the history; nothing is stored elsewhere).

import type { BoardConfig, CardEvent } from "./types.ts";

/** One readable history entry of a card's life. */
export interface HistoryEntry {
  /** "created" | "moved" | "blocked" | "unblocked" — drives the wording. */
  kind: "created" | "moved" | "blocked" | "unblocked";
  /** Column display name the card came from (null for creation). */
  fromName: string | null;
  /** Column display name the card arrived in (null for block events). */
  toName: string | null;
  /** Blocked reason, for "blocked" entries. */
  reason: string | null;
  ts: string;
  actor: string;
}

function columnName(config: BoardConfig, columnId: string | null): string | null {
  if (columnId === null) return null;
  return config.columns.find((column) => column.id === columnId)?.name ?? columnId;
}

function toEntry(event: CardEvent, config: BoardConfig): HistoryEntry | null {
  if (event.type === "created" || event.type === "imported") {
    return {
      kind: "created",
      fromName: null,
      toName: columnName(config, event.toColumn),
      reason: null,
      ts: event.ts,
      actor: event.actor,
    };
  }
  if (event.type === "moved") {
    return {
      kind: "moved",
      fromName: columnName(config, event.fromColumn),
      toName: columnName(config, event.toColumn),
      reason: null,
      ts: event.ts,
      actor: event.actor,
    };
  }
  if (event.type === "blocked" || event.type === "unblocked") {
    const reason = event.payload["reason"];
    return {
      kind: event.type,
      fromName: null,
      toName: null,
      reason: typeof reason === "string" ? reason : null,
      ts: event.ts,
      actor: event.actor,
    };
  }
  return null; // "edited" carries no movement to narrate
}

/**
 * The readable history of one card, most recent first.
 * Inputs: the full event list, the card id, the board config (column
 * display names).
 * Output: HistoryEntry[] sorted by timestamp descending; unknown column
 * ids fall back to the raw id. Failure: none.
 */
export function cardHistory(events: CardEvent[], cardId: string, config: BoardConfig): HistoryEntry[] {
  return events
    .filter((event) => event.cardId === cardId)
    .map((event) => toEntry(event, config))
    .filter((entry): entry is HistoryEntry => entry !== null)
    .sort((a, b) => (a.ts < b.ts ? 1 : -1));
}
