// The COUT PREV perimeter rule as a pure function, and its two kinds of
// « Doutes à trancher » (ADR 062, author 2026-09-30: « quelle valeur on
// garde, quelle valeur on garde pas… est-ce qu'on le prend, est-ce qu'on
// le prend pas »): the rows of one project that disagree on a fact (état,
// type, portefeuille, nom) — the PMO picks the value, each option saying
// what the perimeter makes of it; and a project kept on an unreadable ME
// cell alone — keep it or set it aside like a project without ME. The
// tool's proposal is today's rule (ADR 056). Split from couts.ts (300-line
// cap). Pure.

import type { BoardConfig } from "../../core/types.ts";
import { normalizeLabel } from "./normalize.ts";
import type { Lookup } from "./domains.ts";
import type { PortfolioHit } from "./portfolio.ts";
import { splitSubjectName } from "./subject-name.ts";
import { stripCode } from "./code-prefix.ts";
import { fnv1a } from "./hash.ts";
import { askOrPropose } from "./doubt-book.ts";
import type { DoubtBook, DoubtOptionSpec } from "./doubt-book.ts";
import { coutsVerdict } from "./couts-verdicts.ts";
import type { PerimeterVerdict } from "./projets-types.ts";
import type { FactDispute, ProjectFacts } from "./couts-facts.ts";
import type { Seen } from "./couts-rows.ts";

/** « arbitrage » as a whole word of the name (« d'arbitrage », « Arbitrages RDLI »), never inside another word. */
export const ARBITRAGE = /(?:^|[^a-z0-9])arbitrages?(?:[^a-z0-9]|$)/;

/** What the perimeter rule reads besides the project. */
export interface PerimeterRules {
  /** The exercise year, as the rows write it. */
  year: string;
  config: BoardConfig;
  /** null = no `exercise.states` in the config: every state kept. */
  states: Lookup | null;
  typeLookup: Lookup;
  resolve: (portfolio: string) => PortfolioHit | null;
  book?: DoubtBook;
}

/** An exclusion motive of the COUT PREV rule. */
export type CoutsMotive = Exclude<PerimeterVerdict["motive"], "retained" | "duplicate">;

type MeSeen = Pick<Seen, "onYear" | "hasMe" | "meUnreadable">;

/**
 * The first rule a project fails, without counting anything: off the
 * exercise year, state not retained, type unknown, an arbitrage line, no
 * ME figure (an unreadable cell is not « no figure », ADR 056).
 * Inputs: the rules, the project's rows summary, its facts, its type id.
 * Output: the motive, null when retained. Failure modes: none.
 */
export function ruleMotive(rules: PerimeterRules, seen: MeSeen, facts: Pick<ProjectFacts, "etat" | "name">, typeId: string | null): CoutsMotive | null {
  if (!seen.onYear) return "noYear";
  if (rules.states !== null && rules.states(facts.etat) === null) return "state";
  if (typeId === null) return "type";
  if (ARBITRAGE.test(normalizeLabel(facts.name))) return "arbitrage";
  if (!seen.hasMe && seen.meUnreadable.length === 0) return "noMe";
  return null;
}

/**
 * The title a card takes from a COUT PREV name (the code stripped).
 * Inputs: the name, the code. Output: the title. Failure: none.
 */
export function coutsTitle(name: string, code: string): string {
  return stripCode(splitSubjectName(name).title, code);
}

function domainWords(rules: PerimeterRules, hit: PortfolioHit | null): string {
  if (hit === null) return "aucun domaine résolu — à attribuer à la main";
  const domain = rules.config.domains.find((d) => d.id === hit.domainId);
  const sub = hit.subDomainId === null ? undefined : domain?.subDomains?.find((s) => s.id === hit.subDomainId);
  return `domaine « ${domain?.name ?? hit.domainId}${sub === undefined ? "" : ` / ${sub.name}`} »`;
}

// What the perimeter makes of the project with this value of the fact.
function consequence(rules: PerimeterRules, seen: Seen, facts: ProjectFacts, dispute: FactDispute, value: string): string {
  const variant = { ...facts, [dispute.fact]: value };
  if (dispute.fact === "portfolio") return domainWords(rules, rules.resolve(value));
  const motive = ruleMotive(rules, seen, variant, rules.typeLookup(variant.type)?.id ?? null);
  const verdict = coutsVerdict({ id: seen.id, name: variant.name, etat: variant.etat, type: variant.type }, motive ?? "retained", rules.year);
  const title = dispute.fact === "name" ? `titre « ${coutsTitle(value, seen.id)} » — ` : "";
  return motive === null ? `${title}projet retenu (${verdict.reason})` : `${title}le projet sort du périmètre : ${verdict.reason}`;
}

function valueOption(rules: PerimeterRules, seen: Seen, facts: ProjectFacts, dispute: FactDispute, value: string, count: number): DoubtOptionSpec {
  const rows = count === 0 ? "aucune ligne de l'exercice" : `${count} ligne(s)`;
  return { id: `v:${fnv1a(value)}`, label: `« ${value === "" ? "(vide)" : value} » — ${rows}`, consequence: consequence(rules, seen, facts, dispute, value) };
}

// One disputed fact: the PMO's value, else the rule's (ADR 056).
function settleOne(rules: PerimeterRules, seen: Seen, facts: ProjectFacts, dispute: FactDispute): string {
  const values = dispute.values.some((v) => v.value === dispute.retained) ? dispute.values : [...dispute.values, { value: dispute.retained, count: 0 }];
  const options = values.map((v) => valueOption(rules, seen, facts, dispute, v.value, v.count));
  const listed = dispute.values.map((v) => `« ${v.value} » (${v.count})`).join(", ");
  const applied = askOrPropose(rules.book, {
    kind: "couts-fact", detail: dispute.fact, code: seen.id, name: normalizeLabel(facts.name), title: coutsTitle(facts.name, seen.id),
    why: `Les lignes COUT PREV de ce projet ne donnent pas le même ${dispute.label} : ${listed}. L'outil prend la valeur la plus fréquente` +
      ` ${facts.fromExercise ? `sur les lignes ${rules.year}` : "toutes années"}, puis la date d'export la plus récente.`,
    options, proposed: `v:${fnv1a(dispute.retained)}`,
  });
  return values.find((v) => `v:${fnv1a(v.value)}` === applied)?.value ?? dispute.retained;
}

/**
 * The project's facts once its disputed facts are settled (ADR 062): for
 * each fact its rows disagree on, the value the PMO chose (or remembered),
 * else the rule's. The name is settled first — the other doubts show the
 * title it gives. A project without a row on the exercise year is out
 * whatever its facts: nothing is asked.
 * Inputs: the rules (with the book), the project, the resolved facts.
 * Output: the facts applied, and the words that say which were chosen
 * (null when every fact kept the rule's value). Failure modes: none.
 */
export function settleFacts(rules: PerimeterRules, seen: Seen, resolved: ProjectFacts): { facts: ProjectFacts; settledBy: string | null } {
  const facts = { ...resolved };
  const chosen: string[] = [];
  if (!seen.onYear) return { facts, settledBy: null };
  for (const dispute of resolved.disputes) {
    const value = settleOne(rules, seen, facts, dispute);
    if (value === dispute.retained) continue;
    facts[dispute.fact] = value;
    chosen.push(`${dispute.label} « ${value === "" ? "(vide)" : value} »`);
  }
  return { facts, settledBy: chosen.length === 0 ? null : `${chosen.join(", ")} (tranché à l'import)` };
}

/**
 * The ME doubt (ADR 062): a project that passes every rule but has no
 * readable ME figure, only unreadable cells, is kept by the tool (ADR
 * 056); the PMO may set it aside like a project without ME.
 * Inputs: the rules, the project, its facts. Output: true = keep.
 * Failure modes: none.
 */
export function keepOnUnreadableMe(rules: PerimeterRules, seen: Seen, facts: ProjectFacts): boolean {
  const samples = [...seen.meSamples].sort();
  const applied = askOrPropose(rules.book, {
    kind: "me-unreadable", detail: "me", code: seen.id, name: normalizeLabel(facts.name), title: coutsTitle(facts.name, seen.id),
    why: `Aucune cellule ME lisible sur ${rules.year} : ${samples.map((s) => `« ${s} »`).join(", ")} (ni vide ni zéro). ` +
      "L'outil garde le projet ; sans chiffre ME il serait écarté.",
    options: [
      { id: "garder", label: "Garder le projet", consequence: "le projet reste dans le périmètre" },
      { id: "ecarter", label: "L'écarter (comme sans chiffre ME)", consequence: "le projet sort du périmètre : aucune cellule ME lisible" },
    ],
    proposed: "garder", evidence: samples,
  });
  return applied === "garder";
}
