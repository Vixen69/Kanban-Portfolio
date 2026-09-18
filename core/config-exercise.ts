// Parsers of the exercise block (ADR 024/030) and the capacity thresholds
// (ADR 033) of a board config. Split from config.ts to respect the
// 300-line file cap; config.ts composes them into validateBoardConfig.

import type { CapacityThresholds, ExerciseConfig } from "./types.ts";
import { fail, requireExactKeys, requireRecord, requireText } from "./config-parse.ts";

/** Exercise year assumed by a config that predates ADR 024 (runtime overrides stored before). */
export const DEFAULT_EXERCISE_YEAR = 2026;

/** Tension threshold assumed by a config that predates ADR 033 (90 %). */
export const DEFAULT_TENSION = 0.9;

/**
 * Parses the exercise block: `year`, an integer year (absent = the
 * pre-ADR-024 default, so an admin override stored earlier keeps
 * validating), the optional `states` — the process states kept in the
 * COUT PREV perimeter (ADR 030), a non-empty list of labels when present —
 * and the optional `doneStates` — the states that place a card in the
 * terminal column (ADR 043), each one of `states` when that list is given.
 * Input: the raw value. Output: the ExerciseConfig. Failure: ConfigError.
 */
export function parseExercise(value: unknown): ExerciseConfig {
  if (value === undefined) return { year: DEFAULT_EXERCISE_YEAR };
  const record = requireRecord(value, "exercise");
  for (const key of Object.keys(record)) {
    if (key !== "year" && key !== "states" && key !== "doneStates") fail(`exercise : clé inattendue « ${key} »`);
  }
  const year = record.year;
  if (typeof year !== "number" || !Number.isInteger(year) || year < 2000 || year > 2100) {
    fail("exercise.year doit être une année entière (2000–2100)");
  }
  const states = stateList(record.states, "states");
  const doneStates = stateList(record.doneStates, "doneStates");
  for (const state of doneStates ?? []) {
    if (states !== undefined && !states.includes(state)) {
      fail(`exercise.doneStates : « ${state} » n'est pas dans exercise.states — un état hors périmètre ne place aucune carte`);
    }
  }
  return { year, ...(states === undefined ? {} : { states }), ...(doneStates === undefined ? {} : { doneStates }) };
}

// An optional, non-empty list of state labels.
function stateList(value: unknown, key: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) fail(`exercise.${key} doit être une liste non vide d'états`);
  return value.map((state, i) => requireText(state, `exercise.${key}[${i}]`));
}

/**
 * Parses the capacity thresholds: `tension`, a ratio in (0, 2] from which
 * a person or a métier is « en tension » (ADR 033); absent = the default,
 * so an admin override stored earlier keeps validating.
 * Input: the raw value. Output: the thresholds. Failure: ConfigError.
 */
export function parseCapacity(value: unknown): CapacityThresholds {
  if (value === undefined) return { tension: DEFAULT_TENSION };
  const record = requireExactKeys(value, "capacity", ["tension"]);
  const tension = record.tension;
  if (typeof tension !== "number" || !Number.isFinite(tension) || tension <= 0 || tension > 2) {
    fail("capacity.tension doit être un ratio entre 0 (exclu) et 2 (0,9 = 90 %)");
  }
  return { tension };
}
