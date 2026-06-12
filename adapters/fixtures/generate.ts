// Deterministic generator of the synthetic portfolio (~112 cards).
// Produces subjects AND a plausible backdated event history, so aging and
// future flow metrics are derived from events exactly like real data.

import type { BoardConfig, Financials } from "../../core/types.ts";
import type { Subject } from "../../core/ports.ts";
import { movedEvent, type CardEventInput } from "../../core/events.ts";
import { BLOCK_REASONS, OWNERS, SUBJECT_TITLES, TAGS } from "../../fixtures/dataset.ts";
import { createSeededRandom, type SeededRandom } from "./random.ts";

/** Default seed — every dev machine renders the exact same board. */
export const FIXTURES_SEED = 20260611;
/** Actor recorded on all seeded events. */
export const FIXTURES_ACTOR = "fixtures-seed";

const DAY_MS = 86_400_000;
const TOTAL_CARDS = 112;
/** Hard cap per cell so the radiator always fits 1080px (see core/layout). */
const MAX_CELL_CARDS = 14;

// Per-column share of the portfolio and days-in-column range, by column
// index. Curated for the default 7-column topology; other topologies fall
// back to an even spread.
const COLUMN_PROFILES: { share: number; age: [number, number] }[] = [
  { share: 0.14, age: [1, 22] },
  { share: 0.12, age: [4, 48] },
  { share: 0.17, age: [18, 95] },
  { share: 0.08, age: [1, 26] },
  { share: 0.23, age: [12, 130] },
  { share: 0.1, age: [3, 28] },
  { share: 0.16, age: [8, 80] },
];
const LANE_SHARES = [0.4, 0.35, 0.25];
/** Blocked card quota per column index (middle of the flow blocks most). */
const BLOCKED_QUOTAS: ReadonlyMap<number, number> = new Map([
  [1, 2], [2, 3], [4, 5], [5, 1],
]);
// Criticality shares [top, major] per lane index (the design's NMO mix:
// Projets carry most of the tops); the rest is "normal".
const LANE_CRIT_SHARES: [number, number][] = [
  [0.14, 0.28],
  [0.02, 0.13],
  [0.05, 0.2],
];
// Project-type shares aligned to the default 6-type config order
// (achat, etude, evolution_tma, obsolescence, mise_en_oeuvre, tma_corrective).
const TYPE_SHARES = [0.08, 0.17, 0.23, 0.13, 0.27, 0.12];

/** Everything the fixtures adapter needs to serve and seed a board. */
export interface FixturesPortfolio {
  subjects: Subject[];
  financialsById: Map<string, Financials | null>;
  events: CardEventInput[];
}

function columnProfile(index: number, columnCount: number): { share: number; age: [number, number] } {
  const curated = COLUMN_PROFILES[index];
  if (columnCount === COLUMN_PROFILES.length && curated) return curated;
  return { share: 1 / columnCount, age: [1, 60] };
}

function laneShare(index: number, laneCount: number): number {
  const curated = LANE_SHARES[index];
  if (laneCount === LANE_SHARES.length && curated !== undefined) return curated;
  return 1 / laneCount;
}

/**
 * Builds the per-cell card counts [laneIndex][columnIndex], capping every
 * cell at MAX_CELL_CARDS so the one-screen criterion holds by construction.
 * Inputs: the board config. Output: the count matrix. Failure: none.
 */
export function buildCellCounts(config: BoardConfig): number[][] {
  const laneCount = config.lanes.length;
  const counts: number[][] = config.lanes.map(() => config.columns.map(() => 0));
  config.columns.forEach((_, ci) => {
    const columnTotal = Math.round(columnProfile(ci, config.columns.length).share * TOTAL_CARDS);
    config.lanes.forEach((_, li) => {
      const raw = Math.round(columnTotal * laneShare(li, laneCount));
      (counts[li] as number[])[ci] = Math.min(MAX_CELL_CARDS, raw);
    });
  });
  return counts;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Backdated created + moved events walking the card up to its column. */
function buildHistory(
  rng: SeededRandom,
  config: BoardConfig,
  cardId: string,
  laneId: string,
  columnIndex: number,
  daysInColumn: number,
  now: Date,
): { createdAt: string; events: CardEventInput[] } {
  const events: CardEventInput[] = [];
  let cursor = now.getTime() - daysInColumn * DAY_MS;
  for (let k = columnIndex; k >= 1; k--) {
    const from = config.columns[k - 1] as { id: string };
    const to = config.columns[k] as { id: string };
    events.unshift(
      movedEvent(cardId, { laneId, columnId: from.id }, { laneId, columnId: to.id }, FIXTURES_ACTOR, iso(cursor)),
    );
    cursor -= rng.int(2, 25) * DAY_MS;
  }
  const createdAt = iso(cursor);
  const firstColumn = config.columns[0] as { id: string };
  events.unshift({
    ts: createdAt,
    actor: FIXTURES_ACTOR,
    cardId,
    type: "created",
    fromColumn: null,
    toColumn: firstColumn.id,
    payload: { source: "fixtures" },
  });
  return { createdAt, events };
}

function pickCriticality(rng: SeededRandom, laneIndex: number, laneCount: number): "top" | "major" | "normal" {
  const shares =
    laneCount === LANE_CRIT_SHARES.length ? (LANE_CRIT_SHARES[laneIndex] as [number, number]) : [0.05, 0.15];
  const roll = rng.next();
  if (roll < (shares[0] as number)) return "top";
  if (roll < (shares[0] as number) + (shares[1] as number)) return "major";
  return "normal";
}

function pickTypeId(rng: SeededRandom, config: BoardConfig): string | null {
  if (config.types.length === 0) return null;
  const shares =
    config.types.length === TYPE_SHARES.length ? TYPE_SHARES : config.types.map(() => 1 / config.types.length);
  let roll = rng.next();
  for (let i = 0; i < config.types.length; i++) {
    roll -= shares[i] as number;
    if (roll <= 0) return (config.types[i] as { id: string }).id;
  }
  return (config.types[config.types.length - 1] as { id: string }).id;
}

function buildFinancials(rng: SeededRandom, columnIndex: number, columnCount: number): Financials | null {
  if (rng.next() < 0.1) return null;
  const budget = rng.int(60, 1400);
  const progress = columnCount > 1 ? columnIndex / (columnCount - 1) : 0;
  const range: [number, number] = progress < 0.5 ? [0, 0.15] : progress < 0.8 ? [0.15, 0.85] : [0.8, 1.1];
  const ratio = range[0] + rng.next() * (range[1] - range[0]);
  const consumed = Math.round(budget * ratio);
  return { budget, consumed, remaining: budget - consumed };
}

function addSubject(
  out: FixturesPortfolio,
  daysById: Map<string, number>,
  ctx: {
    rng: SeededRandom;
    config: BoardConfig;
    now: Date;
    laneId: string;
    laneIndex: number;
    columnId: string;
    columnIndex: number;
  },
): void {
  const { rng, config, now } = ctx;
  const id = `S${String(out.subjects.length + 1).padStart(3, "0")}`;
  const age = columnProfile(ctx.columnIndex, config.columns.length).age;
  const days = rng.int(age[0], age[1]);
  const history = buildHistory(rng, config, id, ctx.laneId, ctx.columnIndex, days, now);
  const title = SUBJECT_TITLES[out.subjects.length % SUBJECT_TITLES.length] as string;
  out.subjects.push({
    id,
    title,
    domain: rng.pick(config.domains),
    laneId: ctx.laneId,
    columnId: ctx.columnId,
    owner: rng.pick(OWNERS),
    criticality: pickCriticality(rng, ctx.laneIndex, config.lanes.length),
    typeId: pickTypeId(rng, config),
    codename: `PX${rng.int(1_000_000, 9_999_999)}`,
    tags: rng.shuffle(TAGS).slice(0, rng.int(0, 3)),
    dependencies: [],
    blocked: false,
    blockedReason: null,
    blockedSince: null,
    createdAt: history.createdAt,
    source: "fixtures",
  });
  out.financialsById.set(id, buildFinancials(rng, ctx.columnIndex, config.columns.length));
  out.events.push(...history.events);
  daysById.set(id, days);
}

function addDependencies(subjects: Subject[], rng: SeededRandom): void {
  for (const subject of subjects) {
    if (rng.next() >= 0.25) continue;
    const others = subjects.filter((s) => s.id !== subject.id);
    subject.dependencies = rng
      .shuffle(others)
      .slice(0, rng.int(1, 2))
      .map((s) => s.id);
  }
}

function addBlockedEvents(
  out: FixturesPortfolio,
  daysById: Map<string, number>,
  rng: SeededRandom,
  config: BoardConfig,
  now: Date,
): void {
  config.columns.forEach((column, ci) => {
    const quota = BLOCKED_QUOTAS.get(ci) ?? 0;
    if (quota === 0) return;
    const inColumn = out.subjects.filter((s) => s.columnId === column.id);
    for (const subject of rng.shuffle(inColumn).slice(0, quota)) {
      // Never blocked before entering the current column: the event log
      // must stay chronological per card.
      const daysHere = Math.max(1, Math.min(20, daysById.get(subject.id) ?? 1));
      const blockedDays = rng.int(1, daysHere);
      out.events.push({
        ts: iso(now.getTime() - blockedDays * DAY_MS),
        actor: FIXTURES_ACTOR,
        cardId: subject.id,
        type: "blocked",
        fromColumn: null,
        toColumn: null,
        payload: { reason: rng.pick(BLOCK_REASONS) },
      });
    }
  });
}

/**
 * Generates the deterministic synthetic portfolio.
 * Inputs: the board config, the current Date (ages are relative to it),
 * an optional seed (default FIXTURES_SEED).
 * Output: subjects, per-subject financials and the seeded event history.
 * Failure: none — generation is total for any valid BoardConfig.
 */
export function generatePortfolio(config: BoardConfig, now: Date, seed = FIXTURES_SEED): FixturesPortfolio {
  const rng = createSeededRandom(seed);
  const counts = buildCellCounts(config);
  const out: FixturesPortfolio = { subjects: [], financialsById: new Map(), events: [] };
  const daysById = new Map<string, number>();
  config.lanes.forEach((lane, li) => {
    config.columns.forEach((column, ci) => {
      const cellCount = (counts[li] as number[])[ci] as number;
      for (let k = 0; k < cellCount; k++) {
        addSubject(out, daysById, {
          rng,
          config,
          now,
          laneId: lane.id,
          laneIndex: li,
          columnId: column.id,
          columnIndex: ci,
        });
      }
    });
  });
  addDependencies(out.subjects, rng);
  addBlockedEvents(out, daysById, rng, config, now);
  return out;
}
