// Card history for the detail modal — a readable projection of the event
// log (the log IS the history; nothing is stored elsewhere). Design v11
// narrates movements (created / imported / moved) AND blockages (blocked /
// unblocked, with the motif), most recent first; comments keep their own
// display surface.

import type { BoardConfig, CardEvent } from "./types.ts";
import { isReorder } from "./events.ts";

/** What a history line narrates — a movement or a blocking event. */
export type HistoryKind = "move" | "block" | "unblock" | "decision" | "unlisted" | "relisted";

/** One entry in a card's history, ready for the detail modal list. */
export interface HistoryEntry {
  kind: HistoryKind;
  /** Column display name the card came from — movements only. */
  fromName: string | null;
  /** Column display name the card arrived in ("Entrée" fallback) — movements only. */
  toName: string | null;
  /** Blocking motif (block lines) or decision reason (decision lines); null when none. */
  reason: string | null;
  /** Decision code and name, grid terms, review date — decision lines only. */
  detail: string | null;
  ts: string;
  actor: string;
}

const NARRATED_TYPES: ReadonlySet<CardEvent["type"]> = new Set([
  "created", "imported", "moved", "blocked", "unblocked", "decided", "unlisted", "relisted",
]);

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

function frDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

// A decision line (ADR 026): code and name, the known grid terms in config
// order, the review date; the free-text reason travels in `reason`.
function decisionEntry(config: BoardConfig, event: CardEvent, base: Omit<HistoryEntry, "kind">): HistoryEntry {
  const id = typeof event.payload["decisionId"] === "string" ? event.payload["decisionId"] : "?";
  const decision = config.decisions.find((d) => d.id === id);
  const raw = event.payload["grounds"];
  const wanted = new Set(Array.isArray(raw) ? raw.filter((g): g is string => typeof g === "string") : []);
  const parts = [decision === undefined ? id : `${decision.short} ${decision.name}`];
  for (const ground of config.decisionGrounds) if (wanted.has(ground.id)) parts.push(ground.name);
  const review = event.payload["reviewDate"];
  if (typeof review === "string" && review !== "") parts.push(`réexamen le ${frDay(review)}`);
  const reason = event.payload["reason"];
  return { ...base, kind: "decision", detail: parts.join(" · "), reason: typeof reason === "string" && reason !== "" ? reason : null };
}

function toEntry(config: BoardConfig, event: CardEvent): HistoryEntry {
  const base = { fromName: null, toName: null, reason: null, detail: null, ts: event.ts, actor: event.actor };
  if (event.type === "decided") return decisionEntry(config, event, base);
  if (event.type === "unlisted") return { ...base, kind: "unlisted" };
  if (event.type === "relisted") return { ...base, kind: "relisted" };
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
 * (kind "unblock"), decided (kind "decision", code/name/grid terms/review
 * date in `detail`, the free text in `reason`), unlisted / relisted (ADR 026).
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
