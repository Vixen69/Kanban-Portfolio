// Flow metrics (Sprint 6, pulled forward) — computed EXCLUSIVELY from the
// event log and the event-derived card states, per the contract: no
// separate metrics store, metrics are queries on events.

import type { BoardConfig, CardEvent, CardState } from "./types.ts";
import { agingStep, daysInColumn, isStale } from "./aging.ts";

/** Flow snapshot of one column. */
export interface ColumnFlow {
  columnId: string;
  name: string;
  wipLimit: number | null;
  count: number;
  blocked: number;
  /** Cards per aging step (index = step, length = steps + 1). */
  ageBuckets: number[];
}

/** Aggregated load of one lane (budget k€, from the port's financials). */
export interface LaneLoad {
  laneId: string;
  name: string;
  count: number;
  budget: number;
  consumed: number;
}

/** Everything the metrics view renders. */
export interface FlowMetrics {
  perColumn: ColumnFlow[];
  /** Average days spent in a column, from completed stays in the log. */
  avgStageDays: Record<string, number>;
  laneLoads: LaneLoad[];
  totals: { total: number; delivered: number; blocked: number; stale: number };
  /** The non-terminal column where the most waiting accumulates. */
  bottleneckColumnId: string | null;
}

function perColumnStats(cards: CardState[], config: BoardConfig, now: Date): ColumnFlow[] {
  const steps = config.agingStepsDays.length + 1;
  return config.columns.map((column) => {
    const inColumn = cards.filter((card) => card.columnId === column.id);
    const buckets = Array.from({ length: steps }, () => 0);
    for (const card of inColumn) {
      const step = Math.min(agingStep(daysInColumn(card, now), config), steps - 1);
      buckets[step] = (buckets[step] ?? 0) + 1;
    }
    return {
      columnId: column.id,
      name: column.name,
      wipLimit: column.wipLimit,
      count: inColumn.length,
      blocked: inColumn.filter((card) => card.blocked).length,
      ageBuckets: buckets,
    };
  });
}

/**
 * Average days spent per column, from COMPLETED stays only: each pair of
 * consecutive entry events (created/imported/moved) of one card closes
 * the stay in the first event's column.
 * Inputs: the event log, the board config.
 * Output: columnId -> rounded average days (0 when no completed stay).
 * Failure: none — negative or absurd (>1000d) durations are discarded.
 */
export function stageDurations(events: CardEvent[], config: BoardConfig): Record<string, number> {
  const entries = new Map<string, { columnId: string; ts: number }[]>();
  for (const event of events) {
    if (event.type !== "created" && event.type !== "imported" && event.type !== "moved") continue;
    if (event.toColumn === null) continue;
    const list = entries.get(event.cardId) ?? [];
    list.push({ columnId: event.toColumn, ts: Date.parse(event.ts) });
    entries.set(event.cardId, list);
  }
  const stays = new Map<string, number[]>(config.columns.map((column) => [column.id, []]));
  for (const list of entries.values()) {
    list.sort((a, b) => a.ts - b.ts);
    for (let i = 0; i < list.length - 1; i++) {
      const entry = list[i] as { columnId: string; ts: number };
      const next = list[i + 1] as { columnId: string; ts: number };
      const days = (next.ts - entry.ts) / 86_400_000;
      if (days >= 0 && days < 1000) stays.get(entry.columnId)?.push(days);
    }
  }
  const averages: Record<string, number> = {};
  for (const [columnId, list] of stays) {
    averages[columnId] = list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : 0;
  }
  return averages;
}

function laneLoads(cards: CardState[], config: BoardConfig): LaneLoad[] {
  return config.lanes.map((lane) => {
    const inLane = cards.filter((card) => card.laneId === lane.id);
    return {
      laneId: lane.id,
      name: lane.name,
      count: inLane.length,
      budget: inLane.reduce((sum, card) => sum + (card.budget ?? 0), 0),
      consumed: inLane.reduce((sum, card) => sum + (card.consumed ?? 0), 0),
    };
  });
}

// The last two columns are treated as terminal (delivered / in
// production): they hold finished work and are excluded from the
// bottleneck scan and counted as "delivered".
function terminalColumnIds(config: BoardConfig): Set<string> {
  return new Set(config.columns.slice(-2).map((column) => column.id));
}

function findBottleneck(
  perColumn: ColumnFlow[],
  avgStageDays: Record<string, number>,
  terminal: Set<string>,
): string | null {
  let best: { columnId: string; score: number } | null = null;
  for (const column of perColumn) {
    if (terminal.has(column.columnId)) continue;
    const score = (avgStageDays[column.columnId] ?? 0) * Math.max(1, column.count);
    if (score > 0 && (best === null || score > best.score)) {
      best = { columnId: column.columnId, score };
    }
  }
  return best?.columnId ?? null;
}

/**
 * Computes the full flow snapshot the metrics view renders.
 * Inputs: the event-derived card states, the raw event log, the board
 * config and now.
 * Output: a FlowMetrics. Failure: none — empty logs yield zeroed metrics.
 */
export function computeFlowMetrics(
  cards: CardState[],
  events: CardEvent[],
  config: BoardConfig,
  now: Date,
): FlowMetrics {
  const perColumn = perColumnStats(cards, config, now);
  const avgStageDays = stageDurations(events, config);
  const terminal = terminalColumnIds(config);
  const delivered = cards.filter((card) => terminal.has(card.columnId)).length;
  return {
    perColumn,
    avgStageDays,
    laneLoads: laneLoads(cards, config),
    totals: {
      total: cards.length,
      delivered,
      blocked: cards.filter((card) => card.blocked).length,
      stale: cards.filter((card) => isStale(card, config, now)).length,
    },
    bottleneckColumnId: findBottleneck(perColumn, avgStageDays, terminal),
  };
}
