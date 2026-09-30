// The values a re-import refreshes, compared card by card (ADR 055, author
// 2026-09-30: « les valeurs qui sont actualisées, je dois pouvoir les voir
// rapidement à un endroit et savoir vraiment ce qu'il a pris »): the chef
// de projet, the six money and effort figures, the RDR date and the plan de
// charge — its totals and RAF with the ADR 048 arithmetic, and the métiers
// that moved. Numbers are compared at the hundredth, the precision every
// import figure is stored at. Pure; no React, no Node.

import type { BoardConfig, CardState } from "./types.ts";
import { FIGURE_FACTS } from "./change-types.ts";
import type {
  CardChange, CardPlanFigures, ChangeBase, FigureChange, PlanChange, PlanFigures, ProfilePlanChange,
} from "./change-types.ts";
import { cardRaf, countedIds, hasBreakdown, profileRemaining } from "./raf-card.ts";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function base(card: CardState): ChangeBase {
  return { cardId: card.id, title: card.title, codename: card.codename, exercise: card.exercise ?? null };
}

// Two figures differ when one is missing and not the other, or when they
// differ at the hundredth.
function sameFigure(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return round2(a) === round2(b);
}

function figureChange(fact: FigureChange["fact"], unit: FigureChange["unit"], before: number | null, after: number | null): FigureChange {
  const delta = before === null || after === null ? null : round2(after - before);
  return { fact, unit, before, after, delta };
}

// Σ planned and Σ done over the card's entries — of one métier, or all (null).
function sums(entries: CardState["chargeByProfile"], profileId: string | null): { planned: number; done: number } {
  let jh = 0;
  let done = 0;
  for (const entry of entries) {
    if (profileId !== null && entry.profileId !== profileId) continue;
    jh += entry.jh;
    done += entry.done;
  }
  return { planned: round2(jh), done: round2(done) };
}

/**
 * The plan de charge totals of one card: Σ planned, Σ done, and the reste
 * à faire of the config's métiers (ADR 048, core/raf-card.ts cardRaf).
 * Inputs: the card, the config. Output: CardPlanFigures (zeros and
 * breakdown false for a card « sans ventilation »). Failure: none.
 */
export function cardPlanFigures(card: CardState, config: BoardConfig): CardPlanFigures {
  return { ...sums(card.chargeByProfile, null), raf: cardRaf(card, countedIds(null, config)), breakdown: hasBreakdown(card) };
}

function profileFigures(card: CardState, profileId: string): PlanFigures {
  return { ...sums(card.chargeByProfile, profileId), raf: profileRemaining(card, profileId) };
}

function samePlan(a: PlanFigures, b: PlanFigures): boolean {
  return a.planned === b.planned && a.done === b.done && a.raf === b.raf;
}

// The métiers whose line changed, largest RAF move first, then largest
// planned move, then id — every métier of either board is read.
function profileChanges(before: CardState, after: CardState): ProfilePlanChange[] {
  const ids = [...new Set([...before.chargeByProfile, ...after.chargeByProfile].map((entry) => entry.profileId))];
  const out: ProfilePlanChange[] = [];
  for (const profileId of ids) {
    const then = profileFigures(before, profileId);
    const now = profileFigures(after, profileId);
    if (!samePlan(then, now)) out.push({ profileId, before: then, after: now });
  }
  const size = (c: ProfilePlanChange, key: keyof PlanFigures): number => Math.abs(c.after[key] - c.before[key]);
  return out.sort((a, b) => size(b, "raf") - size(a, "raf") || size(b, "planned") - size(a, "planned") || a.profileId.localeCompare(b.profileId));
}

/**
 * The plan de charge change of one card, or null when no métier's
 * planned, done or RAF moved.
 * Inputs: the card on each board, the config. Output: PlanChange | null.
 * Failure: none.
 */
export function planChange(before: CardState, after: CardState, config: BoardConfig): PlanChange | null {
  const profiles = profileChanges(before, after);
  if (profiles.length === 0) return null;
  return { before: cardPlanFigures(before, config), after: cardPlanFigures(after, config), profiles };
}

/**
 * The refreshed values that differ on one card between two boards: chef de
 * projet, the six figures (FIGURE_FACTS order), date RDR, plan de charge.
 * Inputs: the card on each board (same id), the config. Output: the
 * changes, in that order (empty when none). Failure: none.
 */
export function valueChanges(before: CardState, after: CardState, config: BoardConfig): CardChange[] {
  const out: CardChange[] = [];
  if (before.owner !== after.owner) out.push({ ...base(after), kind: "owner", from: before.owner, to: after.owner });
  for (const { fact, unit } of FIGURE_FACTS) {
    if (sameFigure(before[fact], after[fact])) continue;
    out.push({ ...base(after), kind: "figure", from: null, to: null, figure: figureChange(fact, unit, before[fact], after[fact]) });
  }
  if (before.dateRdr !== after.dateRdr) out.push({ ...base(after), kind: "dateRdr", from: before.dateRdr, to: after.dateRdr });
  const plan = planChange(before, after, config);
  if (plan !== null) out.push({ ...base(after), kind: "plan", from: null, to: null, plan });
  return out;
}
