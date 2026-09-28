// The reste à faire of one card, per métier (ADR 048): the ONE arithmetic
// every board figure is summed from. Per card and per métier, max(0,
// planned − done) of the 2026 plan de charge (chargeByProfile), rounded to
// the hundredth; never the card-level effort (a project-wide figure, not
// annual). A card without a per-métier plan is « sans ventilation » and
// counts 0. Leaf module: no import from the rest of core but the types.

import type { BoardConfig, CardState } from "./types.ts";

/**
 * The métiers counted by the reste à faire: null = every métier of the
 * config (the default), else exactly those ids (possibly none).
 */
export type RafScope = ReadonlySet<string> | null;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The reste à faire of one métier on a card: planned minus done over the
 * card's entries of that profile, clamped at 0, rounded to the hundredth.
 * Inputs: the card, the profile id. Output: j.h remaining. Failure: none.
 */
export function profileRemaining(card: CardState, profileId: string): number {
  let jh = 0;
  let done = 0;
  for (const entry of card.chargeByProfile) {
    if (entry.profileId !== profileId) continue;
    jh += entry.jh;
    done += entry.done;
  }
  return round2(Math.max(0, jh - done));
}

/**
 * The profile ids a scope counts: the config's métiers for null, else the
 * scope's ids that the config knows (an unknown profile never counts).
 * Inputs: the scope, the config. Output: the set. Failure: none.
 */
export function countedIds(scope: RafScope, config: BoardConfig): ReadonlySet<string> {
  const known = config.profiles.map((profile) => profile.id);
  return new Set(scope === null ? known : known.filter((id) => scope.has(id)));
}

/**
 * The reste à faire of a card on the counted métiers.
 * Inputs: the card, the counted profile ids (countedIds). Output: j.h.
 * Failure: none — a card without a plan gives 0.
 */
export function cardRaf(card: CardState, counted: ReadonlySet<string>): number {
  const seen = new Set<string>();
  let total = 0;
  for (const entry of card.chargeByProfile) {
    if (seen.has(entry.profileId) || !counted.has(entry.profileId)) continue;
    seen.add(entry.profileId);
    total += profileRemaining(card, entry.profileId);
  }
  return round2(total);
}

/**
 * True when the card carries a per-métier plan (else « sans ventilation »).
 * Input: the card. Output: the flag. Failure: none.
 */
export function hasBreakdown(card: CardState): boolean {
  return card.chargeByProfile.length > 0;
}

/**
 * The cards the métier lens filters out (ADR 048, author 2026-09-28: they
 * disappear exactly like with the other filters, ADR 031): those without
 * any reste à faire on the counted métiers — a card « sans ventilation »
 * included, nothing says it concerns them.
 * Inputs: the cards, the counted métiers. Output: their ids; none when no
 * métier is counted (« rien » would empty the board). Failure: none.
 */
export function outOfScopeIds(cards: readonly CardState[], counted: ReadonlySet<string>): Set<string> {
  const ids = new Set<string>();
  if (counted.size === 0) return ids;
  for (const card of cards) if (cardRaf(card, counted) <= 0) ids.add(card.id);
  return ids;
}
