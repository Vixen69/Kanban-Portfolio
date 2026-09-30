// The global journal (ADR 052, author 2026-09-30: « un historique de tous
// les déplacements »): every move, decision, blocking, archiving and import
// of the board, newest first — a projection of the event log, nothing
// stored. Filtered on « Décisions depuis l'instantané de la séance » it is
// the decision record to send out after a review (Référentiel 7.8).
// Pure; no React, no Node.

import type { BoardConfig, CardEvent } from "./types.ts";
import { isReorder } from "./events.ts";
import { eventSequence } from "./event-sequence.ts";
import { unifiedColumnIds } from "./layout.ts";
import { gestureTrail, IMPORT_ACTOR, PAUSE_COLUMN_ID, PAUSE_DECISION_ID, type Gesture } from "./gesture.ts";
import { gestureWords } from "./history.ts";
import { readDecision } from "./decision-record.ts";

/** The families the journal can show or hide. */
export type JournalKind = "move" | "decision" | "block" | "archive" | "import";

/** One line of the journal. */
export interface JournalRow {
  id: string;
  seq: number;
  ts: string;
  cardId: string;
  kind: JournalKind;
  /** « Faire entrer », « Mise en pause », « Déplacée », « Bloquée »… */
  label: string;
  /** Places « Actifs · Projets » — moves only. */
  from: string | null;
  to: string | null;
  /** The motif: a decision's terms and texts, a blocking reason. */
  detail: string | null;
  actor: string;
}

/** What the journal keeps. */
export interface JournalFilter {
  kinds: ReadonlySet<JournalKind>;
  /** Only the events after this log position (an instantané's logSeq). */
  afterSeq?: number;
  /** Only the events at or after this instant (ISO). */
  sinceTs?: string;
  /** Only these cards (the exercise shown, the search). */
  cardIds?: ReadonlySet<string>;
}

const LABELS: Partial<Record<CardEvent["type"], [JournalKind, string]>> = {
  created: ["move", "Créée"],
  imported: ["import", "Importée"],
  blocked: ["block", "Bloqué"],
  unblocked: ["block", "Blocage levé"],
  archived: ["archive", "Archivée"],
  unarchived: ["archive", "Désarchivée"],
  deleted: ["archive", "Supprimée"],
  unlisted: ["import", "Absente du dernier import"],
  relisted: ["import", "De retour dans l'import"],
};

/**
 * A place in words: « Actifs · Projets », or the column alone before the
 * RDO (no canal there, ADR 039).
 * Inputs: the config, a canal id, a column id. Output: the words.
 * Failure: none — unknown ids read raw.
 */
export function placeName(config: BoardConfig, laneId: string | null, columnId: string | null): string {
  const column = config.columns.find((c) => c.id === columnId)?.name ?? columnId ?? "?";
  if (columnId === null || unifiedColumnIds(config).has(columnId) || laneId === null) return column;
  return `${column} · ${config.lanes.find((l) => l.id === laneId)?.name ?? laneId}`;
}

function moveRow(config: BoardConfig, event: CardEvent, gesture: Gesture | undefined): Pick<JournalRow, "kind" | "label" | "from" | "to"> {
  const fromLane = event.payload["fromLaneId"];
  const lane = event.payload["laneId"];
  const to = placeName(config, typeof lane === "string" ? lane : null, event.toColumn);
  const from = placeName(config, typeof fromLane === "string" ? fromLane : typeof lane === "string" ? lane : null, event.fromColumn);
  if (event.actor === IMPORT_ACTOR) return { kind: "import", label: "Déplacée par l'import", from, to };
  const words = gesture === undefined ? null : gestureWords(config, event, gesture);
  return { kind: "move", label: words ?? "Déplacée", from, to };
}

const frDay = (isoDate: string) => isoDate.split("-").reverse().join("/");

// A decision's words: its name — « Pause reconduite » when a pause in force
// is renewed — with the pause kind, then the fiche's terms, dates and texts.
function decisionRow(config: BoardConfig, event: CardEvent, renewal: boolean): Pick<JournalRow, "kind" | "label" | "detail"> {
  const decision = readDecision(event);
  if (decision === null) return { kind: "decision", label: "Décision", detail: null };
  const type = config.decisions.find((d) => d.id === decision.decisionId);
  const kind = decision.pauseKind === null ? "" : decision.pauseKind === "tactique" ? " (tactique)" : " (parking)";
  const name = renewal ? "Pause reconduite" : (type?.name ?? decision.decisionId);
  const terms = config.decisionGrounds.filter((g) => decision.grounds.includes(g.id)).map((g) => g.name);
  const dates = [
    ...(decision.reviewDate === null ? [] : [`réexamen le ${frDay(decision.reviewDate)}`]),
    ...(decision.decidedOn === null ? [] : [`décidée le ${frDay(decision.decidedOn)}`]),
    ...(decision.instance === null ? [] : [decision.instance === "revue" ? "Revue Stratégique" : "Synchro"]),
  ];
  const texts = [decision.natureChange, decision.reason].filter((t) => t !== "");
  const detail = [...terms, ...dates, ...texts].join(" · ");
  return { kind: "decision", label: `${name}${kind}`, detail: detail === "" ? null : detail };
}

// Per card, while reading the log: in Pause, and already under a pause
// decision there — the next « Mettre en pause » is then a renewal.
interface PauseTrack { inPause: boolean; decided: boolean }

function trackPause(tracks: Map<string, PauseTrack>, event: CardEvent): boolean {
  const track = tracks.get(event.cardId) ?? { inPause: false, decided: false };
  tracks.set(event.cardId, track);
  if (event.type === "moved" && event.toColumn !== event.fromColumn) {
    track.inPause = event.toColumn === PAUSE_COLUMN_ID;
    if (event.fromColumn === PAUSE_COLUMN_ID) track.decided = false;
  }
  if (event.type !== "decided" || event.payload["decisionId"] !== PAUSE_DECISION_ID) return false;
  const renewal = track.inPause && track.decided;
  track.decided = track.decided || track.inPause;
  return renewal;
}

// One event as a journal row, or null when the journal does not narrate it
// (reorders, edits, comments, the year switch, restores).
function toRow(config: BoardConfig, event: CardEvent, trail: ReadonlyMap<string, Gesture>, renewal: boolean): JournalRow | null {
  const base = { id: event.id, seq: eventSequence(event.id), ts: event.ts, cardId: event.cardId, actor: event.actor, from: null, to: null, detail: null };
  if (event.type === "moved") return isReorder(event) ? null : { ...base, ...moveRow(config, event, trail.get(event.id)) };
  if (event.type === "decided") return { ...base, ...decisionRow(config, event, renewal) };
  const known = LABELS[event.type];
  if (known === undefined) return null;
  const reason = event.type === "blocked" ? event.payload["reason"] : null;
  return { ...base, kind: known[0], label: known[1], detail: typeof reason === "string" && reason !== "" ? reason : null };
}

function kept(row: JournalRow, filter: JournalFilter): boolean {
  if (!filter.kinds.has(row.kind)) return false;
  if (filter.afterSeq !== undefined && row.seq <= filter.afterSeq) return false;
  if (filter.sinceTs !== undefined && row.ts < filter.sinceTs) return false;
  return filter.cardIds === undefined || filter.cardIds.has(row.cardId);
}

/**
 * Every row the journal can narrate, newest first — built once per log,
 * then filtered (filterJournal) at each keystroke or period change.
 * Inputs: the config, the effective events in log order (ADR 042 — undone
 * ones already set aside). Output: JournalRow[]. Failure: none.
 */
export function journalAll(config: BoardConfig, events: readonly CardEvent[]): JournalRow[] {
  const trail = gestureTrail(config, events);
  const tracks = new Map<string, PauseTrack>();
  const rows: JournalRow[] = [];
  for (const event of events) {
    const row = toRow(config, event, trail, trackPause(tracks, event));
    if (row !== null) rows.push(row);
  }
  return rows.sort((a, b) => (a.ts !== b.ts ? (a.ts < b.ts ? 1 : -1) : b.seq - a.seq));
}

/**
 * The rows a filter keeps, in their order.
 * Inputs: the rows (journalAll), the filter. Output: JournalRow[].
 * Failure: none.
 */
export function filterJournal(rows: readonly JournalRow[], filter: JournalFilter): JournalRow[] {
  return rows.filter((row) => kept(row, filter));
}

/**
 * The journal: the narrated events a filter keeps, newest first.
 * Inputs: the config, the effective events in log order, the filter.
 * Output: JournalRow[]. Failure: none.
 */
export function journalRows(config: BoardConfig, events: readonly CardEvent[], filter: JournalFilter): JournalRow[] {
  return filterJournal(journalAll(config, events), filter);
}

/**
 * The journal's head line counts: how many moves, decisions, blockings.
 * Input: the rows shown. Output: a count per kind. Failure: none.
 */
export function journalCounts(rows: readonly JournalRow[]): Record<JournalKind, number> {
  const counts: Record<JournalKind, number> = { move: 0, decision: 0, block: 0, archive: 0, import: 0 };
  for (const row of rows) counts[row.kind] += 1;
  return counts;
}
