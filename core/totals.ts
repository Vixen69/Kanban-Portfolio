// Money and load aggregation (design v12): the totals a column header, a
// canal label and the Metrics view all read. One arithmetic, one place —
// the board gutter and the governance read-out can never disagree.
//
// Contract: callers pass the FOLDED card states they consider live and the
// set of ids the filters dim. Archived cards are the CALLER's responsibility
// (front/App.tsx already excludes them upstream); this module never re-derives
// visibility, so the board and the totals cannot drift apart.

import type { BoardConfig, CardState, Profile } from "./types.ts";
import { profileRemaining } from "./raf-card.ts";

/** One profile's share of an aggregate, in jours-homme. */
export interface LoadByProfile {
  /** Plan de charge, j.h. */
  jh: number;
  /** Consommé, j.h. */
  done: number;
  /**
   * Reste à faire (ADR 048): the sum over the cards of each card's own
   * max(0, planned − done) for this profile — clamped per card, so any
   * partition of the cards adds up exactly to the whole.
   */
  raf: number;
}

/**
 * Aggregated money (k€) and load (j.h) over a set of cards. `byProfile`
 * carries the plan-de-charge split; cards without a per-profile plan fall
 * back to their card-level effort and contribute to jh/done only.
 */
export interface GroupTotals {
  /** Number of cards aggregated. */
  count: number;
  /** Enveloppe RDLI, k€. */
  rdli: number;
  /** Meilleur estimé, k€. */
  estimated: number;
  /** Engagé, k€. */
  engaged: number;
  /** Réalisé, k€. */
  consumed: number;
  /** Plan de charge total, j.h. */
  jh: number;
  /** Consommé du plan de charge, j.h. */
  done: number;
  /** Per-profile split, keyed by profile id. */
  byProfile: Record<string, LoadByProfile>;
  /** Cards without a per-métier plan (« sans ventilation », ADR 048): they count in no reste à faire. */
  blind: number;
}

/** One row of the per-profile breakdown, resolved against the config. */
export interface ProfileLoadRow {
  id: string;
  /** Profile name from the config; falls back to the raw id when unknown. */
  name: string;
  color: string;
  jh: number;
  done: number;
  /** Reste à faire = max(0, jh - done). */
  remaining: number;
}

const UNKNOWN_PROFILE_COLOR = "#64748b";

/**
 * A zeroed aggregate — the neutral element of the accumulation.
 * Inputs: none. Output: a fresh GroupTotals (safe to mutate). Failure: none.
 */
export function emptyTotals(): GroupTotals {
  return { count: 0, rdli: 0, estimated: 0, engaged: 0, consumed: 0, jh: 0, done: 0, byProfile: {}, blind: 0 };
}

/**
 * Reste à faire of an aggregate, in jours-homme: max(0, jh - done). Clamped
 * at zero so an over-consumed plan never reads as negative remaining work.
 * Inputs: an aggregate. Output: j.h remaining. Failure: none.
 */
export function remainingLoad(totals: GroupTotals): number {
  return Math.max(0, totals.jh - totals.done);
}

// Adds one card's load to the aggregate. A card with a per-profile plan is
// attributed profile by profile, its reste à faire clamped per card and
// per profile (ADR 048); one without is counted « sans ventilation » and
// its card-level effort feeds jh/done only (read by core/metrics alone —
// no board figure uses it any more).
function addLoad(totals: GroupTotals, card: CardState): void {
  if (card.chargeByProfile.length === 0) {
    totals.blind++;
    totals.jh += card.effortEstimated ?? 0;
    totals.done += card.effortConsumed ?? 0;
    return;
  }
  const seen = new Set<string>();
  for (const entry of card.chargeByProfile) {
    totals.jh += entry.jh;
    totals.done += entry.done;
    const bucket = totals.byProfile[entry.profileId] ?? { jh: 0, done: 0, raf: 0 };
    bucket.jh += entry.jh;
    bucket.done += entry.done;
    if (!seen.has(entry.profileId)) {
      seen.add(entry.profileId);
      bucket.raf += profileRemaining(card, entry.profileId);
    }
    totals.byProfile[entry.profileId] = bucket;
  }
}

// Adds one card's money and load. Null money fields count as zero: the
// aggregate is a sum of what IS known, never a synthesized envelope.
function addCard(totals: GroupTotals, card: CardState): void {
  totals.count++;
  totals.rdli += card.budgetRdli ?? 0;
  totals.estimated += card.budgetEstimated ?? 0;
  totals.engaged += card.budgetEngaged ?? 0;
  totals.consumed += card.budgetConsumed ?? 0;
  addLoad(totals, card);
}

/**
 * Aggregates an explicit list of cards (no filtering of any kind).
 * Inputs: the cards to sum. Output: their GroupTotals. Failure: none — an
 * empty list yields a zeroed aggregate.
 */
export function totalsOf(cards: readonly CardState[]): GroupTotals {
  const totals = emptyTotals();
  for (const card of cards) addCard(totals, card);
  return totals;
}

// Groups the cards not hidden by a key, seeding every id so a column or
// canal with nothing visible still renders zeros instead of disappearing.
function groupTotals(
  cards: readonly CardState[],
  hidden: ReadonlySet<string>,
  ids: string[],
  keyOf: (card: CardState) => string,
): Record<string, GroupTotals> {
  const groups: Record<string, GroupTotals> = {};
  for (const id of ids) groups[id] = emptyTotals();
  for (const card of cards) {
    if (hidden.has(card.id)) continue;
    const group = groups[keyOf(card)];
    if (group !== undefined) addCard(group, card);
  }
  return groups;
}

/**
 * Per-column totals of the VISIBLE cards (the filters hide, ADR 031, and
 * hidden cards are excluded from the sums — the header reads what the eye
 * sees; `count` is the retained card count).
 * Inputs: the folded card states, the hidden id set, the board config.
 * Output: columnId -> GroupTotals, one entry per configured column (zeroed
 * when empty). Cards in a column unknown to the config are ignored.
 * Failure: none.
 */
export function columnTotals(
  cards: readonly CardState[],
  hidden: ReadonlySet<string>,
  config: BoardConfig,
): Record<string, GroupTotals> {
  const ids = config.columns.map((column) => column.id);
  return groupTotals(cards, hidden, ids, (card) => card.columnId);
}

/**
 * Per-canal totals of the VISIBLE cards — same arithmetic as columnTotals,
 * grouped by lane.
 * Inputs: the folded card states, the hidden id set, the board config.
 * Output: laneId -> GroupTotals, one entry per configured lane. Cards in a
 * lane unknown to the config are ignored. Failure: none.
 */
export function laneTotals(
  cards: readonly CardState[],
  hidden: ReadonlySet<string>,
  config: BoardConfig,
): Record<string, GroupTotals> {
  const ids = config.lanes.map((lane) => lane.id);
  return groupTotals(cards, hidden, ids, (card) => card.laneId);
}

/**
 * The per-profile breakdown of an aggregate, resolved against the config
 * and ordered by decreasing plan de charge (the heaviest profile first).
 * Profiles carrying no charge are dropped; a profile id absent from the
 * config keeps its raw id as name and a neutral color, so a renamed
 * typology degrades instead of vanishing.
 * Inputs: an aggregate, the board config.
 * Output: the rows to render. Failure: none.
 */
export function profileLoadRows(totals: GroupTotals, config: BoardConfig): ProfileLoadRow[] {
  const byId = new Map<string, Profile>(config.profiles.map((profile) => [profile.id, profile]));
  const rows: ProfileLoadRow[] = [];
  for (const [id, load] of Object.entries(totals.byProfile)) {
    if (load.jh <= 0) continue;
    const profile = byId.get(id);
    rows.push({
      id,
      name: profile?.name ?? id,
      color: profile?.color ?? UNKNOWN_PROFILE_COLOR,
      jh: load.jh,
      done: load.done,
      remaining: Math.max(0, load.jh - load.done),
    });
  }
  rows.sort((a, b) => b.jh - a.jh || a.name.localeCompare(b.name, "fr"));
  return rows;
}

/**
 * The reste à faire of an aggregate on the counted métiers (ADR 048): the
 * plain sum of their per-card clamped RAF.
 * Inputs: an aggregate, the counted profile ids (raf-card countedIds).
 * Output: j.h. Failure: none.
 */
export function scopedRaf(totals: GroupTotals, counted: ReadonlySet<string>): number {
  let sum = 0;
  for (const id of counted) sum += totals.byProfile[id]?.raf ?? 0;
  return sum;
}

/**
 * The sum of several aggregates (the board gutter is the sum of the column
 * headers, ADR 048, so the two can never disagree).
 * Input: the aggregates. Output: a fresh GroupTotals. Failure: none.
 */
export function sumTotals(parts: readonly GroupTotals[]): GroupTotals {
  const sum = emptyTotals();
  for (const part of parts) {
    sum.count += part.count;
    sum.rdli += part.rdli;
    sum.estimated += part.estimated;
    sum.engaged += part.engaged;
    sum.consumed += part.consumed;
    sum.jh += part.jh;
    sum.done += part.done;
    sum.blind += part.blind;
    for (const [id, load] of Object.entries(part.byProfile)) {
      const bucket = sum.byProfile[id] ?? { jh: 0, done: 0, raf: 0 };
      bucket.jh += load.jh;
      bucket.done += load.done;
      bucket.raf += load.raf;
      sum.byProfile[id] = bucket;
    }
  }
  return sum;
}

/**
 * The per-métier reste à faire of an aggregate, counted métiers only,
 * largest first (the unfolded header's breakdown, ADR 048). Métiers with
 * nothing left are dropped; a profile unknown to the config never shows.
 * Inputs: an aggregate, the config, the counted profile ids.
 * Output: the rows (remaining = the per-card clamped RAF). Failure: none.
 */
export function rafRows(totals: GroupTotals, config: BoardConfig, counted: ReadonlySet<string>): ProfileLoadRow[] {
  const rows: ProfileLoadRow[] = [];
  for (const profile of config.profiles) {
    const load = totals.byProfile[profile.id];
    if (!counted.has(profile.id) || load === undefined || load.raf <= 0) continue;
    rows.push({ id: profile.id, name: profile.name, color: profile.color, jh: load.jh, done: load.done, remaining: load.raf });
  }
  rows.sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name, "fr"));
  return rows;
}

