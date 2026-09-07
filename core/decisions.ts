// Decisions on a card (ADR 026, Référentiel V3.1 §7.5/7.8): the "decided"
// events are the trace — « non tracée = non prise ». This module reads
// the projection the fold builds (CardState.decisions): the last decision,
// its review date against today, the grid terms it was motivated with.
// Pure; no React, no Node.

import type { BoardConfig, CardDecision, CardState, DecisionGround, DecisionType } from "./types.ts";

const DAY_MS = 86_400_000;

/** The last decision of a card, read against the config and the day. */
export interface DecisionStatus {
  entry: CardDecision;
  /** The decision type, null when the config no longer knows the id. */
  decision: DecisionType | null;
  /** Whole days until the review date (negative = overdue), null without one. */
  daysToReview: number | null;
  /** True when the review date is past. */
  overdue: boolean;
}

/**
 * Whether a string is a calendar date in ISO form (YYYY-MM-DD) that exists.
 * Input: the string. Output: true for "2026-10-01", false for "2026-13-01"
 * or "01/10/2026". Failure: none.
 */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * The most recent decision recorded on a card (the fold keeps them in
 * chronological order). Input: the card state. Output: the CardDecision or
 * null. Failure: none.
 */
export function lastDecision(card: CardState): CardDecision | null {
  return card.decisions.length === 0 ? null : (card.decisions[card.decisions.length - 1] ?? null);
}

/**
 * The last decision read against the config and today's date.
 * Inputs: the card state, the config (decision types), now.
 * Output: the DecisionStatus, or null when the card carries no decision.
 * Failure: none — an unknown decision id yields decision null.
 */
export function decisionStatus(card: CardState, config: BoardConfig, now: Date): DecisionStatus | null {
  const entry = lastDecision(card);
  if (entry === null) return null;
  const decision = config.decisions.find((d) => d.id === entry.decisionId) ?? null;
  let daysToReview: number | null = null;
  if (entry.reviewDate !== null && isIsoDate(entry.reviewDate)) {
    const review = Date.parse(`${entry.reviewDate}T00:00:00.000Z`);
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    daysToReview = Math.round((review - today) / DAY_MS);
  }
  return { entry, decision, daysToReview, overdue: daysToReview !== null && daysToReview < 0 };
}

/**
 * The grid terms behind a decision, in config order (unknown ids dropped).
 * Inputs: the config, the ground ids. Output: the DecisionGround[].
 * Failure: none.
 */
export function groundsOf(config: BoardConfig, ids: readonly string[]): DecisionGround[] {
  const wanted = new Set(ids);
  return config.decisionGrounds.filter((ground) => wanted.has(ground.id));
}

/**
 * Whether a card's last decision has a review date already past.
 * Inputs: the card state, now. Output: boolean. Failure: none.
 */
export function reviewOverdue(card: CardState, now: Date): boolean {
  const entry = lastDecision(card);
  if (entry === null || entry.reviewDate === null || !isIsoDate(entry.reviewDate)) return false;
  const review = Date.parse(`${entry.reviewDate}T00:00:00.000Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return review < today;
}
