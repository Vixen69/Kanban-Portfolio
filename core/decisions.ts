// Decisions on a card (ADR 026, Référentiel V3.1 §7.5/7.8): the "decided"
// events are the trace — « non tracée = non prise ». This module reads
// the projection the fold builds (CardState.decisions): the pause in force
// on a card in Pause and its review (ADR 052), the grid terms, and the
// ISO day check shared with the middle.
// Pure; no React, no Node.

import type { BoardConfig, CardDecision, CardState, DecisionGround } from "./types.ts";
import { PAUSE_COLUMN_ID, PAUSE_DECISION_ID } from "./gesture.ts";

const DAY_MS = 86_400_000;

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
 * The grid terms behind a decision, in config order (unknown ids dropped).
 * Inputs: the config, the ground ids. Output: the DecisionGround[].
 * Failure: none.
 */
export function groundsOf(config: BoardConfig, ids: readonly string[]): DecisionGround[] {
  const wanted = new Set(ids);
  return config.decisionGrounds.filter((ground) => wanted.has(ground.id));
}

function daysUntil(isoDate: string | null, now: Date): number | null {
  if (isoDate === null || !isIsoDate(isoDate)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((Date.parse(`${isoDate}T00:00:00.000Z`) - today) / DAY_MS);
}

/** The pause a card in Pause is under (ADR 052). */
export interface PauseStatus {
  /** The « Mettre en pause » decision in force; null = the pause is not traced. */
  entry: CardDecision | null;
  /** Whole days until the review (negative = overdue), null without a date. */
  daysToReview: number | null;
  overdue: boolean;
}

/**
 * The pause in force on a card sitting in Pause: the last « Mettre en
 * pause » recorded since the card last LEFT Pause (with the move, traced
 * or renewed later from the fiche, or — before ADR 052 — just before the
 * drag). Neither the year switch (« activated ») nor a canal change inside
 * Pause loses it. Only a card in Pause shows a decision on the board.
 * Inputs: the card state, now. Output: the PauseStatus, or null when the
 * card is not in Pause. Failure: none.
 */
export function pauseStatus(card: CardState, now: Date): PauseStatus | null {
  if (card.columnId !== PAUSE_COLUMN_ID) return null;
  const since = card.pauseLeftAt ?? "";
  const current = card.decisions.filter((d) => d.decisionId === PAUSE_DECISION_ID && d.ts > since);
  const entry = current.length === 0 ? null : (current[current.length - 1] ?? null);
  const daysToReview = daysUntil(entry?.reviewDate ?? null, now);
  return { entry, daysToReview, overdue: daysToReview !== null && daysToReview < 0 };
}

/**
 * Whether a card in Pause is past its review date (the sidebar counter).
 * Inputs: the card state, now. Output: boolean. Failure: none.
 */
export function reviewOverdue(card: CardState, now: Date): boolean {
  return pauseStatus(card, now)?.overdue === true;
}
