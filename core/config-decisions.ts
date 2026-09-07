// The decision vocabulary of the board (ADR 026, Référentiel V3.1): the six
// portfolio decisions D1–D6 and the arbitration grid's terms (PROTÉGER /
// METTRE EN PAUSE) a traced decision is motivated with. Split from
// config.ts for the 300-line cap; both lists default to the referential's
// when a config predates ADR 026 (runtime overrides stored earlier).

import type { DecisionGround, DecisionGroundFamily, DecisionType } from "./types.ts";
import { fail, parseNonEmptyArray, requireExactKeys, requireText, uniqueIds } from "./config-parse.ts";

const FAMILIES: readonly DecisionGroundFamily[] = ["proteger", "pause"];

/** The six decisions of the referential (§7.5); D4–D6 carry a mandatory reason (§7.8). */
export const DEFAULT_DECISIONS: readonly DecisionType[] = [
  { id: "D1", name: "Faire entrer", short: "D1", color: "#0f766e", traced: false },
  { id: "D2", name: "Continuer", short: "D2", color: "#15803d", traced: false },
  { id: "D3", name: "Réduire", short: "D3", color: "#b45309", traced: false },
  { id: "D4", name: "Mettre en pause", short: "D4", color: "#7c3aed", traced: true },
  { id: "D5", name: "Requalifier", short: "D5", color: "#2563eb", traced: true },
  { id: "D6", name: "Stopper", short: "D6", color: "#b91c1c", traced: true },
];

/** The arbitration grid's terms (atelier): what protects a subject, what pauses it. */
export const DEFAULT_DECISION_GROUNDS: readonly DecisionGround[] = [
  { id: "fin_proche", name: "Proche de la fin", family: "proteger" },
  { id: "valeur_forte", name: "Forte valeur métier", family: "proteger" },
  { id: "debloque", name: "Débloque d’autres sujets", family: "proteger" },
  { id: "engagement", name: "Engagement pris", family: "proteger" },
  { id: "strategique", name: "Stratégique", family: "proteger" },
  { id: "n_avance_pas", name: "N’avance pas", family: "pause" },
  { id: "valeur_faible", name: "Valeur faible au regard du reste à faire", family: "pause" },
  { id: "affame", name: "Affame un fournisseur saturé", family: "pause" },
  { id: "peut_attendre", name: "Peut attendre", family: "pause" },
];

function parseDecision(value: unknown, index: number): DecisionType {
  const path = `decisions[${index}]`;
  const rec = requireExactKeys(value, path, ["id", "name", "short", "color", "traced"]);
  if (typeof rec.traced !== "boolean") fail(`${path}.traced doit être un booléen`);
  return {
    id: requireText(rec.id, `${path}.id`),
    name: requireText(rec.name, `${path}.name`),
    short: requireText(rec.short, `${path}.short`),
    color: requireText(rec.color, `${path}.color`),
    traced: rec.traced,
  };
}

function parseGround(value: unknown, index: number): DecisionGround {
  const path = `decisionGrounds[${index}]`;
  const rec = requireExactKeys(value, path, ["id", "name", "family"]);
  const family = rec.family;
  if (typeof family !== "string" || !FAMILIES.includes(family as DecisionGroundFamily)) {
    fail(`${path}.family doit être « proteger » ou « pause »`);
  }
  return {
    id: requireText(rec.id, `${path}.id`),
    name: requireText(rec.name, `${path}.name`),
    family: family as DecisionGroundFamily,
  };
}

/**
 * Parses the `decisions` list; absent = the referential's six decisions.
 * Input: the raw value. Output: the DecisionType[] (unique ids).
 * Failure: ConfigError naming the first bad field.
 */
export function parseDecisions(value: unknown): DecisionType[] {
  if (value === undefined) return DEFAULT_DECISIONS.map((d) => ({ ...d }));
  const decisions = parseNonEmptyArray(value, "decisions", parseDecision);
  uniqueIds(decisions, "decisions");
  return decisions;
}

/**
 * Parses the `decisionGrounds` list; absent = the referential's grid terms.
 * Input: the raw value. Output: the DecisionGround[] (unique ids).
 * Failure: ConfigError naming the first bad field.
 */
export function parseDecisionGrounds(value: unknown): DecisionGround[] {
  if (value === undefined) return DEFAULT_DECISION_GROUNDS.map((g) => ({ ...g }));
  const grounds = parseNonEmptyArray(value, "decisionGrounds", parseGround);
  uniqueIds(grounds, "decisionGrounds");
  return grounds;
}
