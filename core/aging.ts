// Time is visible: age categories, decay overlay, age labels and the andon
// escalation rule. All thresholds come from BoardConfig.age / the board
// config — nothing hard-coded here (design v9: AGE fresh/recent/aging/stale).

import type { AgeCategory, AgeThresholds, BoardConfig, CardState } from "./types.ts";

const DAY_MS = 86_400_000;

// Decay curve constants (design formula, generalized to config thresholds).
const AGING_ALPHA_START = 0.12;
const AGING_ALPHA_END = 0.3;
const STALE_ALPHA_MAX = 0.45;
/** The stale ramp spans 1.5 x agingMaxDays (design: 90 days for a 60-day threshold). */
const STALE_RAMP_FACTOR = 1.5;

/**
 * Whole days elapsed between two ISO timestamps, clamped to >= 0.
 * Inputs: a start ISO timestamp and the current Date.
 * Output: integer day count (0 for anything under 24h or a future start).
 * Failure: returns 0 when the start timestamp is unparseable.
 */
export function daysSince(startIso: string, now: Date): number {
  const start = Date.parse(startIso);
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((now.getTime() - start) / DAY_MS));
}

/**
 * Days a card has sat in its current column (drives all age signals).
 * Inputs: a CardState (enteredColumnAt derived from events) and now.
 * Output: integer day count >= 0.
 * Failure: none (delegates to daysSince).
 */
export function daysInColumn(card: CardState, now: Date): number {
  return daysSince(card.enteredColumnAt, now);
}

/**
 * Age bucket for a day count against the config thresholds:
 * <= freshMaxDays "fresh", <= recentMaxDays "recent", <= agingMaxDays
 * "aging", beyond "stale".
 * Inputs: day count, the age thresholds (BoardConfig.age).
 * Output: one of the four AgeCategory values.
 * Failure: none (assumes validated, strictly ascending thresholds).
 */
export function ageCategory(days: number, age: AgeThresholds): AgeCategory {
  if (days <= age.freshMaxDays) return "fresh";
  if (days <= age.recentMaxDays) return "recent";
  if (days <= age.agingMaxDays) return "aging";
  return "stale";
}

/**
 * Black-overlay alpha for stagnation. Deliberately 0 through fresh/recent
 * (the age text carries the fine grain); then 0.12 -> 0.30 across the aging
 * band, and 0.30 -> 0.45 over a stale ramp of 1.5 x agingMaxDays, capped.
 * Inputs: day count, the age thresholds (BoardConfig.age).
 * Output: alpha in [0, 0.45].
 * Failure: degenerate (non-ascending) thresholds fall back to the band's
 * end value instead of dividing by zero.
 */
export function decayAlpha(days: number, age: AgeThresholds): number {
  if (days <= age.recentMaxDays) return 0;
  if (days <= age.agingMaxDays) {
    const band = age.agingMaxDays - age.recentMaxDays;
    if (band <= 0) return AGING_ALPHA_END;
    return AGING_ALPHA_START + ((days - age.recentMaxDays) / band) * (AGING_ALPHA_END - AGING_ALPHA_START);
  }
  const ramp = age.agingMaxDays * STALE_RAMP_FACTOR;
  if (ramp <= 0) return STALE_ALPHA_MAX;
  const alpha = AGING_ALPHA_END + ((days - age.agingMaxDays) / ramp) * (STALE_ALPHA_MAX - AGING_ALPHA_END);
  return Math.min(STALE_ALPHA_MAX, alpha);
}

/**
 * Compact French age label: "3j" under 14 days, rounded "2s" under 60,
 * else rounded "4m".
 * Input: integer day count. Output: the label string. Failure: none.
 */
export function ageLabel(days: number): string {
  if (days < 14) return `${days}j`;
  if (days < 60) return `${Math.round(days / 7)}s`;
  return `${Math.round(days / 30)}m`;
}

/**
 * True when a card is stagnant: in its column strictly beyond agingMaxDays.
 * Inputs: a CardState, the board config, now. Output: boolean.
 * Failure: none.
 */
export function isStale(card: CardState, config: BoardConfig, now: Date): boolean {
  return daysInColumn(card, now) > config.age.agingMaxDays;
}

/**
 * Andon rule: blocked longer than andonThresholdDays gets the static
 * escalation marker (on top of the pulsing border every blocked card has).
 * Inputs: a CardState, the board config, now.
 * Output: true when the card is blocked strictly beyond the threshold.
 * Failure: none — a blocked card without blockedSince never escalates.
 */
export function isAndon(card: CardState, config: BoardConfig, now: Date): boolean {
  if (!card.blocked || card.blockedSince === null) return false;
  return daysSince(card.blockedSince, now) > config.andonThresholdDays;
}
