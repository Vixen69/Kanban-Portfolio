// Performance bench of the core read paths (sprint de perf, 2026-09-17):
// the fold, the filters and counts, the totals, the analytics read-outs
// and one card's history, on the dev board (data/board.jsonl) grown to
// 10 000 and 50 000 synthetic events. Prints medians in milliseconds.
// Usage: node scripts/bench-perf.ts [path/to/board.jsonl]
// No assertion, no write: a measurement tool, not a test.

import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import type { BoardConfig, CardEvent, CardState } from "../core/types.ts";
import { validateBoardConfig } from "../core/config.ts";
import { foldEvents } from "../core/state.ts";
import { defaultFilters, hiddenCardIds, viewCounts } from "../core/filters.ts";
import { columnTotals, laneTotals, totalsOf } from "../core/totals.ts";
import { stageDwell } from "../core/stage-dwell.ts";
import { blockages, flowSummary, wipRows } from "../core/metrics-flow.ts";
import { flowTimes } from "../core/flow.ts";
import { cardHistory } from "../core/history.ts";
import { computeCapacityReadout } from "../core/capacity-view.ts";
import { loadState } from "../middle/storage/jsonl-format.ts";

const REPEAT = 7;
const NOW = new Date("2026-09-17T09:00:00.000Z");

function median(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

// Runs `work` REPEAT times and returns the median duration in ms.
function bench(work: () => unknown): number {
  const times: number[] = [];
  for (let i = 0; i < REPEAT; i++) {
    const start = performance.now();
    work();
    times.push(performance.now() - start);
  }
  return median(times);
}

// Grows the log with synthetic moves cycling the cards through the columns
// (realistic shape: one card id, a column transition, a laneId payload).
function grow(events: CardEvent[], cards: CardState[], config: BoardConfig, total: number): CardEvent[] {
  const out = [...events];
  let seq = events.length + 1;
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  while (out.length < total) {
    const card = cards[seq % cards.length]!;
    const from = config.columns[seq % config.columns.length]!;
    const to = config.columns[(seq + 1) % config.columns.length]!;
    out.push({
      id: `evt-${seq}`, ts: new Date(base + seq * 60_000).toISOString(), actor: "bench", cardId: card.id,
      type: "moved", fromColumn: from.id, toColumn: to.id, payload: { laneId: card.laneId, fromLaneId: card.laneId },
    });
    seq++;
  }
  return out;
}

function row(label: string, ms: number): void {
  console.log(`${label.padEnd(44)} ${ms.toFixed(1).padStart(8)} ms`);
}

function runScale(cards: CardState[], events: CardEvent[], config: BoardConfig, snapshot: Parameters<typeof computeCapacityReadout>[0] | null): void {
  console.log(`\n--- ${cards.length} cartes · ${events.length} évènements`);
  const folded = foldEvents(cards, events);
  const active = folded.filter((c) => !c.archived);
  const filters = { ...defaultFilters(config), search: "a" };
  const probe = active[0]!.id;
  row("foldEvents", bench(() => foldEvents(cards, events)));
  row("hiddenCardIds + viewCounts (une frappe)", bench(() => viewCounts(active, hiddenCardIds(active, filters), config, NOW)));
  row("columnTotals + laneTotals + totalsOf", bench(() => { columnTotals(active, new Set(), config); laneTotals(active, new Set(), config); totalsOf(active); }));
  row("cardHistory + flowTimes (une fiche)", bench(() => { cardHistory(events, probe, config); flowTimes(events, probe, config, NOW); }));
  row("flowSummary + wipRows + blockages", bench(() => { flowSummary(active, events, config, NOW); wipRows(active, config); blockages(active, config, NOW); }));
  row("stageDwell", bench(() => stageDwell(active, events, config, NOW)));
  if (snapshot !== null) row("computeCapacityReadout", bench(() => computeCapacityReadout(snapshot, active, config, NOW)));
  row("JSON.stringify(events) (charge utile)", bench(() => JSON.stringify(events)));
  console.log(`   charge utile évènements : ${(JSON.stringify(events).length / 1024).toFixed(0)} Ko`);
}

const path = process.argv[2] ?? "data/board.jsonl";
const config = validateBoardConfig(JSON.parse(readFileSync("config/board.json", "utf8")));
const { state } = loadState(readFileSync(path, "utf8"));
const cards = foldEvents([...state.cards.values()], state.events);
const snapshot = state.capacity.get(config.exercise.year) ?? [...state.capacity.values()][0] ?? null;
console.log(`base : ${state.cards.size} cartes, ${state.events.length} évènements, capacité ${snapshot === null ? "absente" : `${snapshot.persons.length} personnes`}`);
for (const total of [state.events.length, 10_000, 50_000]) {
  runScale(cards, grow(state.events, cards, config, total), config, snapshot);
}
