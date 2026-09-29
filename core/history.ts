// Card history for the detail modal — a readable projection of the event
// log (the log IS the history; nothing is stored elsewhere). Design v11
// narrates movements (created / imported / moved) AND blockages (blocked /
// unblocked, with the motif), most recent first; comments keep their own
// display surface.

import type { BoardConfig, CardEvent } from "./types.ts";
import { isReorder } from "./events.ts";
import { gestureTrail, IMPORT_ACTOR, type Gesture } from "./gesture.ts";
import { readDecision } from "./decision-record.ts";

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
  /**
   * What a movement means (ADR 052): « Faire entrer », « Qualifiée : Petits
   * Projets », « Requalifiée : Projets → Petits Projets », « Mise en pause »,
   * « Reprise » — null for a plain move.
   */
  gesture: string | null;
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

function laneName(config: BoardConfig, laneId: string | null): string {
  if (laneId === null) return "?";
  return config.lanes.find((lane) => lane.id === laneId)?.name ?? laneId;
}

/**
 * The words of a movement's gesture (ADR 052), or null for a plain move.
 * Inputs: the config (canal names), the recorded event, its gesture.
 * Output: « Faire entrer », « Qualifiée : X », « Requalifiée : X → Y »,
 * « Mise en pause », « Reprise », joined by « · » when two apply.
 * Failure: none.
 */
export function gestureWords(config: BoardConfig, event: CardEvent, gesture: Gesture): string | null {
  const from = event.payload["fromLaneId"];
  const to = event.payload["laneId"];
  const words: string[] = [];
  if (gesture.stage === "entry") words.push("Faire entrer");
  if (gesture.stage === "pause") words.push("Mise en pause");
  if (gesture.stage === "resume") words.push("Reprise");
  if (gesture.canal === "qualification") words.push(`Qualifiée : ${laneName(config, typeof to === "string" ? to : null)}`);
  if (gesture.canal === "requalification") {
    words.push(`Requalifiée : ${laneName(config, typeof from === "string" ? from : null)} → ${laneName(config, typeof to === "string" ? to : null)}`);
  }
  return words.length === 0 ? null : words.join(" · ");
}

// The fiche's blocks worth a history line (ADR 052), in reading order.
function decisionParts(config: BoardConfig, event: CardEvent): { parts: string[]; reason: string | null } {
  const decision = readDecision(event);
  if (decision === null) return { parts: ["?"], reason: null };
  const type = config.decisions.find((d) => d.id === decision.decisionId);
  const parts = [type === undefined ? decision.decisionId : `${type.short} ${type.name}`];
  if (decision.pauseKind !== null) parts.push(decision.pauseKind === "tactique" ? "pause tactique" : "pause parking");
  if (decision.fromLaneId !== null && decision.toLaneId !== null) {
    parts.push(`${laneName(config, decision.fromLaneId)} → ${laneName(config, decision.toLaneId)}`);
  }
  const wanted = new Set(decision.grounds);
  for (const ground of config.decisionGrounds) if (wanted.has(ground.id)) parts.push(ground.name);
  if (decision.reviewDate !== null) parts.push(`réexamen le ${frDay(decision.reviewDate)}`);
  if (decision.architectValidated) parts.push("validée par un architecte");
  if (decision.decidedOn !== null) parts.push(`décidée le ${frDay(decision.decidedOn)}`);
  const texts = [decision.natureChange, decision.reason, decision.liftCondition === "" ? "" : `Pour la lever : ${decision.liftCondition}`];
  const reason = texts.filter((t) => t !== "").join(" — ");
  return { parts, reason: reason === "" ? null : reason };
}

// A decision line (ADR 026/052): code and name, pause kind, canal change,
// the known grid terms in config order, the review date; the texts
// (what changed, the reason, what lifts the pause) travel in `reason`.
function decisionEntry(config: BoardConfig, event: CardEvent, base: Omit<HistoryEntry, "kind">): HistoryEntry {
  const { parts, reason } = decisionParts(config, event);
  return { ...base, kind: "decision", detail: parts.join(" · "), reason };
}

function toEntry(config: BoardConfig, event: CardEvent, trail: ReadonlyMap<string, Gesture>): HistoryEntry {
  const base = { fromName: null, toName: null, reason: null, detail: null, gesture: null, ts: event.ts, actor: event.actor };
  if (event.type === "decided") return decisionEntry(config, event, base);
  if (event.type === "unlisted") return { ...base, kind: "unlisted" };
  if (event.type === "relisted") return { ...base, kind: "relisted" };
  if (event.type === "blocked") {
    const reason = event.payload["reason"];
    return { ...base, kind: "block", reason: typeof reason === "string" ? reason : null };
  }
  if (event.type === "unblocked") return { ...base, kind: "unblock" };
  const gesture = trail.get(event.id);
  return {
    ...base,
    kind: "move",
    fromName: event.type === "moved" ? columnName(config, event.fromColumn) : null,
    toName: columnName(config, event.toColumn) ?? ENTRY_LABEL,
    gesture: gesture === undefined || event.actor === IMPORT_ACTOR ? null : gestureWords(config, event, gesture),
  };
}

function oldestFirst(a: CardEvent, b: CardEvent): number {
  return -newestFirst(a, b);
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
 * movements and are not narrated. A hand movement carries its gesture's
 * words (ADR 052); the import's moves carry none. Failure: none.
 */
export function cardHistory(events: CardEvent[], cardId: string, config: BoardConfig): HistoryEntry[] {
  const mine = events.filter((event) => event.cardId === cardId).sort(oldestFirst);
  const trail = gestureTrail(config, mine);
  return mine
    .filter((event) => NARRATED_TYPES.has(event.type) && !isReorder(event))
    .sort(newestFirst)
    .map((event) => toEntry(config, event, trail));
}

