// Time is visible: aging steps, age labels and the andon escalation rule.
// All thresholds come from the board config — nothing hard-coded here.

import type { BoardConfig, CardState } from "./types.ts";

const DAY_MS = 86_400_000;

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
 * Days a card has sat in its current column (drives the darkening).
 * Inputs: a CardState (enteredColumnAt derived from events) and now.
 * Output: integer day count >= 0.
 * Failure: none (delegates to daysSince).
 */
export function daysInColumn(card: CardState, now: Date): number {
  return daysSince(card.enteredColumnAt, now);
}

/**
 * Aging step for a day count: 0 = fresh, then one step per crossed
 * threshold of agingStepsDays (e.g. [7,21,45,90] yields steps 0..4).
 * Inputs: day count, the board config.
 * Output: integer step in [0, agingStepsDays.length].
 * Failure: none.
 */
export function agingStep(days: number, config: BoardConfig): number {
  let step = 0;
  for (const threshold of config.agingStepsDays) {
    if (days >= threshold) step++;
  }
  return step;
}

/**
 * Compact French age label: "3j" under 14 days, "2s" under 60, else "4m".
 * Input: integer day count. Output: the label string. Failure: none.
 */
export function ageLabel(days: number): string {
  if (days < 14) return `${days}j`;
  if (days < 60) return `${Math.round(days / 7)}s`;
  return `${Math.round(days / 30)}m`;
}

/**
 * True when the age label itself should alert (red): the card has crossed
 * the second-to-last aging threshold (45 days with the default steps).
 * Inputs: integer day count, the board config. Output: boolean.
 * Failure: none — a single-step config alerts from that lone threshold.
 */
export function isHotAge(days: number, config: BoardConfig): boolean {
  const steps = config.agingStepsDays;
  const threshold = steps.length > 1 ? steps[steps.length - 2] : steps[0];
  return threshold !== undefined && days >= threshold;
}

/**
 * True when a card is stagnant: in its column beyond the last aging step.
 * Inputs: a CardState, the board config, now. Output: boolean.
 * Failure: none.
 */
export function isStale(card: CardState, config: BoardConfig, now: Date): boolean {
  const last = config.agingStepsDays[config.agingStepsDays.length - 1];
  return last !== undefined && daysInColumn(card, now) > last;
}

/**
 * Andon rule: blocked longer than andonThresholdDays gets the static
 * escalation marker (on top of the pulsing border every blocked card has).
 * Inputs: a CardState, the board config, now.
 * Output: true when the card is blocked beyond the threshold.
 * Failure: none — a blocked card without blockedSince never escalates.
 */
export function isAndon(card: CardState, config: BoardConfig, now: Date): boolean {
  if (!card.blocked || card.blockedSince === null) return false;
  return daysSince(card.blockedSince, now) > config.andonThresholdDays;
}
