// Flow metrics (port of design/metrics.jsx computeFlowMetrics) — computed
// EXCLUSIVELY from the event log and the event-derived card states, per the
// contract: no separate metrics store, metrics are queries on events.
// Answers the governance questions: where does work pile up, where does it
// stagnate, what is blocked, and how much load is committed vs consumed.

import type { BoardConfig, CardEvent, CardState } from "./types.ts";
import { ageCategory, daysInColumn } from "./aging.ts";
import { isReorder } from "./events.ts";

const DAY_MS = 86_400_000;

/** Flow snapshot of one column: count, blockages and age composition. */
export interface ColumnFlow {
  id: string;
  name: string;
  wip: number | null;
  count: number;
  blocked: number;
  fresh: number;
  recent: number;
  aging: number;
  stale: number;
}

/** Committed vs consumed effort of one lane (jours-homme). */
export interface LaneLoad {
  id: string;
  name: string;
  /** Sum of effortEstimated over the lane's cards. */
  est: number;
  /** Sum of effortConsumed over the lane's cards. */
  cons: number;
  count: number;
}

/** Portfolio head-line numbers of the metrics view. */
export interface FlowTotals {
  total: number;
  /** Cards sitting in the last two (terminal) columns. */
  delivered: number;
  blocked: number;
  /** Cards past the agingMaxDays threshold in their current column. */
  stale: number;
}

/** Everything the metrics view renders. */
export interface FlowMetrics {
  /** Column ids in board order — the iteration order of the panels. */
  order: string[];
  perColumn: Record<string, ColumnFlow>;
  /** Average days spent in a column, from completed stays in the log. */
  avgStageDays: Record<string, number>;
  laneLoads: Record<string, LaneLoad>;
  totals: FlowTotals;
  /**
   * Non-terminal column where the most waiting accumulates (highest
   * avgStageDays x max(1, count); earliest column wins ties). Null only
   * when the board has no non-terminal column.
   */
  bottleneck: string | null;
}

// An event that opens a stay in a column (created/imported/moved chains).
// Same-cell reorders (ADR 019) are rank changes, not stage entries: they
// must never close a running stay nor open a new one.
function isEntryEvent(event: CardEvent): boolean {
  return (
    (event.type === "created" || event.type === "imported" || event.type === "moved") &&
    event.toColumn !== null &&
    !isReorder(event)
  );
}

// Numeric suffix of an event id ("evt-12" -> 12). Lexicographic comparison
// would order "evt-10" before "evt-9" and break same-instant replays.
function eventSequence(id: string): number {
  const sequence = Number(id.slice(id.lastIndexOf("-") + 1));
  return Number.isNaN(sequence) ? 0 : sequence;
}

// The fold ordering: timestamp first, numeric insertion sequence on ties.
function byTsThenSequence(a: CardEvent, b: CardEvent): number {
  return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : eventSequence(a.id) - eventSequence(b.id);
}

/**
 * Average days spent per column, from COMPLETED stays only: within one
 * card's chain of entry events (created/imported/moved, ordered by ts
 * then numeric id suffix), each event closes the stay opened by the
 * previous one.
 * Inputs: the full event log, the board config.
 * Output: columnId -> rounded average days (0 when no completed stay).
 * Failure: none — negative, unparseable or absurd (>= 1000 days) spans
 * are discarded, as are stays in columns absent from the config.
 */
export function stageDurations(events: CardEvent[], config: BoardConfig): Record<string, number> {
  const chains = new Map<string, CardEvent[]>();
  for (const event of events) {
    if (!isEntryEvent(event)) continue;
    const chain = chains.get(event.cardId);
    if (chain) chain.push(event);
    else chains.set(event.cardId, [event]);
  }
  const stays = new Map<string, number[]>(config.columns.map((column) => [column.id, []]));
  for (const chain of chains.values()) {
    chain.sort(byTsThenSequence);
    for (let i = 0; i < chain.length - 1; i++) {
      const entry = chain[i] as CardEvent;
      const next = chain[i + 1] as CardEvent;
      const days = (Date.parse(next.ts) - Date.parse(entry.ts)) / DAY_MS;
      if (days >= 0 && days < 1000) stays.get(entry.toColumn as string)?.push(days);
    }
  }
  const averages: Record<string, number> = {};
  for (const [columnId, list] of stays) {
    averages[columnId] = list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : 0;
  }
  return averages;
}

function emptyColumnFlows(config: BoardConfig): Record<string, ColumnFlow> {
  const flows: Record<string, ColumnFlow> = {};
  for (const column of config.columns) {
    flows[column.id] = {
      id: column.id,
      name: column.name,
      wip: column.wip,
      count: 0,
      blocked: 0,
      fresh: 0,
      recent: 0,
      aging: 0,
      stale: 0,
    };
  }
  return flows;
}

function emptyLaneLoads(config: BoardConfig): Record<string, LaneLoad> {
  const loads: Record<string, LaneLoad> = {};
  for (const lane of config.lanes) {
    loads[lane.id] = { id: lane.id, name: lane.name, est: 0, cons: 0, count: 0 };
  }
  return loads;
}

// Bottleneck = active/study stage with the most accumulated waiting. A
// strictly-greater comparison keeps the earliest column on ties, matching
// the design's stable descending sort.
function findBottleneck(
  order: string[],
  terminal: ReadonlySet<string>,
  perColumn: Record<string, ColumnFlow>,
  avgStageDays: Record<string, number>,
): string | null {
  let best: { id: string; score: number } | null = null;
  for (const id of order) {
    if (terminal.has(id)) continue;
    const score = (avgStageDays[id] ?? 0) * Math.max(1, perColumn[id]?.count ?? 0);
    if (best === null || score > best.score) best = { id, score };
  }
  return best === null ? null : best.id;
}

/**
 * Computes every metric of the flow view in one pass over the portfolio.
 * Cards in a column or lane unknown to the config are skipped by the
 * per-column / per-lane aggregates (they still count in totals.total).
 * Inputs: the event-derived card states, the raw event log, the board
 * config and now.
 * Output: a FlowMetrics — see the interface doc for each part.
 * Failure: none — an empty portfolio yields zeroed metrics.
 */
export function computeFlowMetrics(
  cards: CardState[],
  events: CardEvent[],
  config: BoardConfig,
  now: Date,
): FlowMetrics {
  const order = config.columns.map((column) => column.id);
  const terminal = new Set(order.slice(-2));
  const perColumn = emptyColumnFlows(config);
  const laneLoads = emptyLaneLoads(config);
  const totals: FlowTotals = { total: cards.length, delivered: 0, blocked: 0, stale: 0 };
  for (const card of cards) {
    const category = ageCategory(daysInColumn(card, now), config.age);
    if (card.blocked) totals.blocked++;
    if (category === "stale") totals.stale++;
    if (terminal.has(card.columnId)) totals.delivered++;
    const column = perColumn[card.columnId];
    if (column) {
      column.count++;
      if (card.blocked) column.blocked++;
      column[category]++;
    }
    const lane = laneLoads[card.laneId];
    if (lane) {
      lane.count++;
      lane.est += card.effortEstimated ?? 0;
      lane.cons += card.effortConsumed ?? 0;
    }
  }
  const avgStageDays = stageDurations(events, config);
  const bottleneck = findBottleneck(order, terminal, perColumn, avgStageDays);
  return { order, perColumn, avgStageDays, laneLoads, totals, bottleneck };
}
