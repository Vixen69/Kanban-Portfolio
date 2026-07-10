// Per-card flow times (design v11 « Délais »): per-stage ages, lead time
// and cycle time, reconstructed exclusively from the card's events — the
// event log is the single metrics source (no separate store, ADR 002).
// Stage anchors are resolved from the runtime config, never hardcoded:
// the topology is admin-editable (ADR 013), so a renamed or removed column
// degrades gracefully to « — » instead of breaking the section.

import type { BoardConfig, CardEvent, Column } from "./types.ts";
import { isReorder } from "./events.ts";

const DAY_MS = 86_400_000;

/** The stage anchors of the flow-time projection, resolved from a config. */
export interface FlowAnchors {
  /** The intake column (always the first — all intake enters left). */
  entry: Column;
  /** The qualification stage: id "qualification", else the second column. */
  qualification: Column | null;
  /** First activation stage: id "actifs", else right after the DoR gate. */
  activation: Column | null;
  /** Terminal stage: id "done", else the DoD-gated column. */
  terminal: Column | null;
}

/**
 * Resolves the flow-time stage anchors from the runtime config.
 * Inputs: the board config. Output: the anchors, or null when the config
 * has no columns (nothing can be anchored). Resolution prefers the NMO
 * column ids and falls back to structural positions (gates, indexes) so an
 * admin-edited topology keeps a meaningful Délais section. Failure: none.
 */
export function resolveFlowAnchors(config: BoardConfig): FlowAnchors | null {
  const cols = config.columns;
  const entry = cols[0];
  if (entry === undefined) return null;
  const qualification = cols.find((c) => c.id === "qualification") ?? cols[1] ?? null;
  const dorIndex = cols.findIndex((c) => c.gate === "DoR");
  const activation = cols.find((c) => c.id === "actifs")
    ?? (dorIndex >= 0 ? cols[dorIndex + 1] ?? null : null);
  const terminal = cols.find((c) => c.id === "done") ?? cols.find((c) => c.gate === "DoD") ?? null;
  return { entry, qualification, activation, terminal };
}

/** Per-card flow times, in whole days (null = the stage was never entered). */
export interface FlowTimes {
  /** Days since the first entry into the entry column (creation fallback). */
  ageEntry: number | null;
  /** Days since the first entry into the qualification stage. */
  ageQualification: number | null;
  /** Days since the first activation. */
  ageActivation: number | null;
  /** Entry → terminal (or today while unfinished). */
  leadTime: number | null;
  /** First activation → terminal (or today); null when never activated. */
  cycleTime: number | null;
  /** True once the card entered the terminal column or any later one. */
  finished: boolean;
}

function numericSuffix(eventId: string): number {
  const match = /(\d+)$/.exec(eventId);
  return match ? Number(match[1]) : 0;
}

function oldestFirst(a: CardEvent, b: CardEvent): number {
  if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
  return numericSuffix(a.id) - numericSuffix(b.id);
}

// First arrival (ms) into the given column, or null when never entered.
function stageEntryAt(events: CardEvent[], columnId: string | null): number | null {
  if (columnId === null) return null;
  const hit = events.find((event) => event.toColumn === columnId);
  return hit ? Date.parse(hit.ts) : null;
}

// First arrival (ms) into the terminal column or any column after it.
function terminalEntryAt(events: CardEvent[], config: BoardConfig, terminal: Column | null): number | null {
  if (terminal === null) return null;
  const terminalIndex = config.columns.findIndex((c) => c.id === terminal.id);
  const indexById = new Map(config.columns.map((c, i) => [c.id, i]));
  const hit = events.find((event) => {
    const index = event.toColumn === null ? -1 : indexById.get(event.toColumn) ?? -1;
    return index >= terminalIndex;
  });
  return hit ? Date.parse(hit.ts) : null;
}

function daysSince(ms: number | null, nowMs: number): number | null {
  return ms === null ? null : Math.max(0, Math.round((nowMs - ms) / DAY_MS));
}

function daysBetween(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : Math.max(0, Math.round((b - a) / DAY_MS));
}

/**
 * The flow times of one card, projected from the event log.
 * Inputs: the full event list, the card id, the board config (anchors) and
 * the current time. Output: FlowTimes — ages in whole days per stage, lead
 * time (entry → terminal or today), cycle time (first activation → terminal
 * or today, null when never activated) and the finished flag. The entry
 * timestamp falls back to the card's first event (creation/import) when the
 * entry column was never recorded as a destination. Failure: none — a card
 * with no events returns all-null, unfinished.
 */
export function flowTimes(events: CardEvent[], cardId: string, config: BoardConfig, now: Date): FlowTimes {
  const anchors = resolveFlowAnchors(config);
  // Same-cell reorders (ADR 019) are rank changes, never stage arrivals.
  const mine = events.filter((event) => event.cardId === cardId && !isReorder(event)).sort(oldestFirst);
  const nowMs = now.getTime();
  if (anchors === null || mine.length === 0) {
    return { ageEntry: null, ageQualification: null, ageActivation: null, leadTime: null, cycleTime: null, finished: false };
  }
  const first = mine[0] as CardEvent;
  const tEntry = stageEntryAt(mine, anchors.entry.id) ?? Date.parse(first.ts);
  const tQualification = stageEntryAt(mine, anchors.qualification?.id ?? null);
  const tActivation = stageEntryAt(mine, anchors.activation?.id ?? null);
  const tTerminal = terminalEntryAt(mine, config, anchors.terminal);
  const end = tTerminal ?? nowMs;
  return {
    ageEntry: daysSince(tEntry, nowMs),
    ageQualification: daysSince(tQualification, nowMs),
    ageActivation: daysSince(tActivation, nowMs),
    leadTime: daysBetween(tEntry, end),
    cycleTime: tActivation === null ? null : daysBetween(tActivation, end),
    finished: tTerminal !== null,
  };
}
