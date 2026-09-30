// The live read-outs of the sidebar and header (split from filters.ts to
// respect the 300-line file cap): how many cards are shown and how the
// shown subset splits by state, criticality and — since ADR 061 — domain
// problems (no domain, domain to verify). Pure; re-exported by filters.ts.

import { reviewOverdue } from "./decisions.ts";
import type { BoardConfig, CardState } from "./types.ts";
import { isStale } from "./aging.ts";
import { domainIssue } from "./domain-check.ts";

/**
 * The live read-out of the sidebar and header: how many cards are shown
 * (not hidden) and how the shown subset splits by state and criticality.
 * `total` is always the whole portfolio.
 */
export interface ViewCounts {
  shown: number;
  total: number;
  blocked: number;
  stale: number;
  top: number;
  major: number;
  normal: number;
  /** Cards the last import did not list (ADR 026). */
  absent: number;
  /** Cards whose last decision's review date is past (ADR 026). */
  toReview: number;
  /** Cards without domain (ADR 061) — the « Sans domaine » pill. */
  noDomain: number;
  /** Cards with a domain problem — none, or one to verify (ADR 061). */
  domainCheck: number;
}

function emptyCounts(total: number): ViewCounts {
  return { shown: 0, total, blocked: 0, stale: 0, top: 0, major: 0, normal: 0, absent: 0, toReview: 0, noDomain: 0, domainCheck: 0 };
}

function tally(counts: ViewCounts, card: CardState, config: BoardConfig, now: Date): void {
  counts.shown++;
  if (card.blocked) counts.blocked++;
  if (isStale(card, config, now)) counts.stale++;
  if (card.absentFromLastImport !== null) counts.absent++;
  if (reviewOverdue(card, now)) counts.toReview++;
  const issue = domainIssue(card);
  if (issue === "missing") counts.noDomain++;
  if (issue !== null) counts.domainCheck++;
  counts[card.criticality]++;
}

/**
 * Counts over the VISIBLE subset: only the cards not hidden are tallied
 * (shown, blocked, stale, per-criticality, domain problems); total is the
 * whole portfolio size.
 * Inputs: all card states, the hidden id set, the board config (stale
 * threshold), now. Output: a ViewCounts. Failure: none.
 */
export function viewCounts(
  cards: CardState[],
  hidden: ReadonlySet<string>,
  config: BoardConfig,
  now: Date,
): ViewCounts {
  const counts = emptyCounts(cards.length);
  for (const card of cards) {
    if (!hidden.has(card.id)) tally(counts, card, config, now);
  }
  return counts;
}

/**
 * Counts over the WHOLE portfolio, ignoring filters (the sidebar's muted
 * reference totals and the header stats). shown always equals total.
 * Inputs: all card states, the board config, now.
 * Output: a ViewCounts. Failure: none.
 */
export function portfolioCounts(cards: CardState[], config: BoardConfig, now: Date): ViewCounts {
  const counts = emptyCounts(cards.length);
  for (const card of cards) {
    tally(counts, card, config, now);
  }
  return counts;
}
