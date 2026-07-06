// Deterministic generator of the 150-subject portfolio — an exact port of
// design/data.jsx (same seed, pools, distributions and RNG call order for
// card values), remapped onto the v2 event model: the movement history
// becomes imported + moved events ("sciforma-sync"), blockages become
// blocked events, follow-up comments become commented events.

import type { BoardConfig, Criticality, Financials, NatureKey } from "../../core/types.ts";
import type { Subject } from "../../core/ports.ts";
import { lifecycleEvent, movedEvent, type CardEventInput } from "../../core/events.ts";
import {
  BLOCK_REASONS,
  COMMENTS,
  CP_NAMES,
  PLAN_CHARGE,
  RESSOURCES,
  SUBJECT_NAMES,
} from "../../fixtures/dataset.ts";
import { createSeededRandom, type SeededRandom } from "./random.ts";
import {
  AGE_PROFILE,
  BLOCKED_FILL,
  CANALS,
  COLUMN_FILL,
  CONSUMED_RATIO,
  DOMAIN_FILL,
  EFFORT_BAND,
  FLOW_ORDER,
  STEP_DAYS,
  TYPE_FILL,
} from "./distributions.ts";

/** Default seed (design/data.jsx) — every machine renders the same board. */
export const FIXTURES_SEED = 20260609;
/** Actor recorded on all seeded history events (simulated PPM sync). */
export const FIXTURES_ACTOR = "sciforma-sync";
/** Portfolio size pinned by the design (one-screen acceptance criterion). */
export const TOTAL_CARDS = 150;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Everything the fixtures adapter needs to serve and seed a board. */
export interface FixturesPortfolio {
  subjects: Subject[];
  financialsById: Map<string, Financials | null>;
  events: CardEventInput[];
}

interface CommentSpec { actor: string; atMs: number; text: string }

interface Draft {
  subject: Subject;
  financials: Financials;
  comments: CommentSpec[];
  /** When the card entered its current column (ms) — set by buildHistory. */
  enteredAtMs: number;
  /** imported + moved (+ blocked) events, chronological. */
  events: CardEventInput[];
}

const iso = (ms: number): string => new Date(ms).toISOString();

// Distribution-table lookup; an unknown key is a programming error.
function range(table: Record<string, [number, number]>, key: string): [number, number] {
  const found = table[key];
  if (!found) throw new Error(`fixtures : étape inconnue « ${key} »`);
  return found;
}

// Refuse a config that lost a default NMO id (no dangling references).
function assertTopology(config: BoardConfig): void {
  const has = (list: { id: string }[], id: string): boolean => list.some((item) => item.id === id);
  const missing: string[] = [];
  for (const canal of CANALS) if (!has(config.lanes, canal.laneId)) missing.push(`canal ${canal.laneId}`);
  for (const [id] of COLUMN_FILL) if (!has(config.columns, id)) missing.push(`colonne ${id}`);
  for (const [id] of DOMAIN_FILL) if (!has(config.domains, id)) missing.push(`domaine ${id}`);
  for (const [id] of TYPE_FILL) if (!has(config.types, id)) missing.push(`type ${id}`);
  if (missing.length > 0) {
    throw new Error(
      `fixtures : la configuration ne contient pas les identifiants requis (${missing.join(", ")})`,
    );
  }
}

// Step 1 (design): canal + criticality specs, shuffled into board order.
function buildSpecs(rng: SeededRandom): { laneId: string; nature: NatureKey; criticality: Criticality }[] {
  const specs: { laneId: string; nature: NatureKey; criticality: Criticality }[] = [];
  for (const canal of CANALS) {
    const crit = rng.shuffle<Criticality>([
      ...Array<Criticality>(canal.top).fill("top"),
      ...Array<Criticality>(canal.major).fill("major"),
      ...Array<Criticality>(canal.normal).fill("normal"),
    ]);
    for (const criticality of crit) specs.push({ laneId: canal.laneId, nature: canal.nature, criticality });
  }
  return rng.shuffle(specs);
}

function shuffledFill(rng: SeededRandom, fill: [string, number][]): string[] {
  const out: string[] = [];
  for (const [id, count] of fill) for (let k = 0; k < count; k++) out.push(id);
  return rng.shuffle(out);
}

// Per-card random values, pulled in the exact design order so every card
// gets the same owner/codename/estimates as the validated prototype.
function rollCardData(rng: SeededRandom, laneId: string, columnId: string, nowMs: number) {
  const owner = rng.pick(CP_NAMES);
  const sciformaId = rng.next() < 0.72 ? `SCF-${rng.int(1000, 9999)}` : null;
  const codename = `PX${rng.int(1_000_000, 9_999_999)}`;
  const band = range(EFFORT_BAND, laneId);
  const effortEstimated = rng.int(band[0], band[1]);
  const [lo, hi] = range(CONSUMED_RATIO, columnId);
  const effortConsumed = Math.round(effortEstimated * (lo + rng.next() * (hi - lo)));
  const budgetEstimated = Math.round(effortEstimated * (0.5 + rng.next() * 0.4));
  const budgetConsumed = effortEstimated
    ? Math.round(budgetEstimated * (effortConsumed / effortEstimated))
    : 0;
  const loadPlan = rng.pick(PLAN_CHARGE);
  const resources = rng.shuffle(RESSOURCES).slice(0, rng.int(1, 3));
  const comments: CommentSpec[] = rng.shuffle(COMMENTS).slice(0, rng.int(0, 2)).map((text) => ({
    actor: rng.pick(CP_NAMES),
    atMs: nowMs - rng.int(1, 40) * DAY_MS,
    text,
  }));
  return {
    owner, sciformaId, codename, effortEstimated, effortConsumed,
    budgetEstimated, budgetConsumed, loadPlan, resources, comments,
  };
}

function draftCard(
  rng: SeededRandom,
  spec: { laneId: string; nature: NatureKey; criticality: Criticality },
  assign: { id: string; title: string; columnId: string; domain: string; typeId: string },
  nowMs: number,
): Draft {
  const data = rollCardData(rng, spec.laneId, assign.columnId, nowMs);
  const subject: Subject = {
    id: assign.id, title: assign.title, domain: assign.domain,
    laneId: spec.laneId, columnId: assign.columnId, owner: data.owner,
    criticality: spec.criticality, typeId: assign.typeId, codename: data.codename,
    nature: spec.nature, tags: [], dependencies: [],
    blocked: false, blockedReason: null, blockedSince: null,
    effortEstimated: data.effortEstimated, effortConsumed: data.effortConsumed,
    loadPlan: data.loadPlan, resources: data.resources, notes: "",
    sciformaId: data.sciformaId, custom: {}, createdAt: "", source: "fixtures",
  };
  const financials: Financials = {
    budget: data.budgetEstimated,
    consumed: data.budgetConsumed,
    remaining: data.budgetEstimated - data.budgetConsumed,
  };
  return { subject, financials, comments: data.comments, enteredAtMs: nowMs, events: [] };
}

// Step 3 (design): mark the blocked quota per column with a pooled reason.
function assignBlockReasons(rng: SeededRandom, drafts: Draft[]): void {
  for (const [columnId, quota] of BLOCKED_FILL) {
    const pool = rng.shuffle(drafts.filter((draft) => draft.subject.columnId === columnId));
    for (let i = 0; i < quota && i < pool.length; i++) {
      const subject = (pool[i] as Draft).subject;
      subject.blocked = true;
      subject.blockedReason = rng.pick(BLOCK_REASONS);
    }
  }
}

// Step 4 (design): age in column + a plausible path from Demandes, walked
// backwards, emitted as one imported event then moved events.
function buildHistory(rng: SeededRandom, draft: Draft, nowMs: number): void {
  const subject = draft.subject;
  const [lo, hi] = range(AGE_PROFILE, subject.columnId);
  let days = rng.int(lo, hi);
  if (subject.blocked) days = Math.max(days, rng.int(35, hi));
  draft.enteredAtMs = nowMs - days * DAY_MS;
  const index = FLOW_ORDER.indexOf(subject.columnId);
  const moves: CardEventInput[] = [];
  let cursorMs = draft.enteredAtMs;
  for (let k = index; k >= 1; k--) {
    const from = FLOW_ORDER[k - 1] as string;
    const to = FLOW_ORDER[k] as string;
    // The design draws an actor for the LAST transition (pick(['vous',
    // 'sciforma-sync'])); our actor is fixed, but the draw must still be
    // consumed so every later draw — hence every per-card age — matches the
    // validated prototype exactly.
    if (k === index) rng.next();
    moves.unshift(movedEvent(
      subject.id,
      { laneId: subject.laneId, columnId: from },
      { laneId: subject.laneId, columnId: to },
      FIXTURES_ACTOR,
      iso(cursorMs),
    ));
    const step = range(STEP_DAYS, from);
    cursorMs -= rng.int(step[0], step[1]) * DAY_MS;
  }
  subject.createdAt = iso(cursorMs);
  const imported: CardEventInput = {
    ...lifecycleEvent("imported", subject.id, FIXTURES_ACTOR, subject.createdAt, { laneId: subject.laneId }),
    toColumn: FLOW_ORDER[0] as string,
  };
  draft.events = [imported, ...moves];
}

// One blocked event per blocked card; never before it entered its column.
function appendBlockedEvents(rng: SeededRandom, drafts: Draft[], nowMs: number): void {
  for (const draft of drafts) {
    const subject = draft.subject;
    if (!subject.blocked || subject.blockedReason === null) continue;
    let tsMs = nowMs - rng.int(6, 30) * DAY_MS;
    if (tsMs <= draft.enteredAtMs) tsMs = draft.enteredAtMs + HOUR_MS;
    subject.blockedSince = iso(tsMs);
    draft.events.push(
      lifecycleEvent("blocked", subject.id, FIXTURES_ACTOR, subject.blockedSince, {
        reason: subject.blockedReason,
      }),
    );
  }
}

// Comments as commented events; a card cannot be commented before it exists.
function commentEvents(draft: Draft): CardEventInput[] {
  const importedMs = Date.parse(draft.subject.createdAt);
  return draft.comments.map((comment) => {
    const tsMs = Math.max(comment.atMs, importedMs + HOUR_MS);
    return lifecycleEvent("commented", draft.subject.id, comment.actor, iso(tsMs), {
      text: comment.text,
    });
  });
}

/**
 * Generates the deterministic 150-subject synthetic portfolio (design v9).
 * Inputs: the board config (must contain the default NMO lane/column/domain/
 * type ids), the current Date (all ages are relative to it), an optional
 * seed (default FIXTURES_SEED — the design seed).
 * Output: subjects (with import-time snapshots), per-subject financials
 * (budget k€ pair) and the full backdated event history, per-card
 * chronological.
 * Failure: throws when the config lost one of the ids the dataset targets.
 */
export function generatePortfolio(config: BoardConfig, now: Date, seed = FIXTURES_SEED): FixturesPortfolio {
  assertTopology(config);
  const rng = createSeededRandom(seed);
  const nowMs = now.getTime();
  const specs = buildSpecs(rng);
  const columns = shuffledFill(rng, COLUMN_FILL);
  const domains = shuffledFill(rng, DOMAIN_FILL);
  const titles = rng.shuffle(SUBJECT_NAMES);
  const typeIds = shuffledFill(rng, TYPE_FILL);
  const drafts = specs.map((spec, i) =>
    draftCard(rng, spec, {
      id: `S${String(i + 1).padStart(3, "0")}`,
      title: titles[i] ?? `${titles[i % titles.length] as string} (lot ${Math.floor(i / titles.length) + 1})`,
      columnId: columns[i] as string,
      domain: domains[i] as string,
      typeId: typeIds[i] as string,
    }, nowMs),
  );
  assignBlockReasons(rng, drafts);
  for (const draft of drafts) buildHistory(rng, draft, nowMs);
  appendBlockedEvents(rng, drafts, nowMs);
  const out: FixturesPortfolio = { subjects: [], financialsById: new Map(), events: [] };
  for (const draft of drafts) {
    const all = [...draft.events, ...commentEvents(draft)];
    all.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    out.subjects.push(draft.subject);
    out.financialsById.set(draft.subject.id, draft.financials);
    out.events.push(...all);
  }
  return out;
}
