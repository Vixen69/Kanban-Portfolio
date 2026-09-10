// Vocabulary helpers shared by the contract readers (ADR 022, R3/R4):
// tolerant lookups of the board's domains, sub-domains and types, the
// parenthesized type suffix the exports append (« (Projet) »,
// « (Opportunité) », « (Run) » — ignored by decision), and the
// whole-word person matching used to exclude domain leads from the chef
// de projet. Pure and dependency-free.

import type { BoardConfig } from "../../core/types.ts";
import { createTolerantLookup, normalizeLabel } from "./normalize.ts";
import type { TolerantHit } from "./normalize.ts";

/** A tolerant label -> id lookup (null = unknown or ambiguous). */
export type Lookup = (cell: string) => TolerantHit | null;

/**
 * Builds a tolerant domain lookup accepting id, name or short code.
 * Inputs: the board config. Outputs: cell -> hit or null. Failure: none.
 */
export function createDomainLookup(config: BoardConfig): Lookup {
  return createTolerantLookup(
    config.domains.flatMap((d): Array<[string, string]> => [[d.id, d.id], [d.name, d.id], [d.short, d.id]]),
  );
}

/**
 * Builds, per detailed domain, a tolerant sub-domain lookup (id or name).
 * Inputs: the board config. Outputs: domainId -> lookup; an undetailed
 * domain has no entry. Failure: none.
 */
export function createSubDomainLookups(config: BoardConfig): Map<string, Lookup> {
  const lookups = new Map<string, Lookup>();
  for (const domain of config.domains) {
    if (domain.subDomains === undefined) continue;
    lookups.set(domain.id, createTolerantLookup(
      domain.subDomains.flatMap((s): Array<[string, string]> => [[s.id, s.id], [s.name, s.id]]),
    ));
  }
  return lookups;
}

/**
 * Strips the parenthesized suffix the exports append to a type label
 * (« Etude (Opportunité) » -> « Etude »); decision R3: the suffix
 * distinguishes nothing.
 * Inputs: the raw type cell. Outputs: the base label, trimmed. Failure: none.
 */
export function typeBaseLabel(raw: string): string {
  return raw.replace(/\s*\([^()]*\)\s*$/, "").trim();
}

// A normalized alias as a whole-word pattern inside a normalized label
// (« obsolescence » inside « projet de gestion de l'obsolescence »): the
// alias's words, any separator run between them, a non-alphanumeric or an
// edge on both sides. Built without escapes — only [a-z0-9] words survive.
function keywordPattern(alias: string): RegExp {
  const core = normalizeLabel(alias).split(/[^a-z0-9]+/).filter((w) => w !== "").join("[^a-z0-9]+");
  return new RegExp("(?:^|[^a-z0-9])" + core + "(?:[^a-z0-9]|$)");
}

/**
 * Builds a tolerant type lookup over the base label: id, name, short or
 * alias (exact, then accent-damage tolerant), then — for the aliases only —
 * the alias searched INSIDE the label as a whole word (author, 2026-09-10:
 * the September « obsolescence » labels matched none of the spellings
 * dictated so far; a keyword survives every variant). A keyword hitting
 * several types is ambiguous and yields null, never a guess.
 * Inputs: the board config. Outputs: cell -> hit or null. Failure: none.
 */
export function createTypeLookup(config: BoardConfig): Lookup {
  const lookup = createTolerantLookup(
    config.types.flatMap((t): Array<[string, string]> => [
      [t.id, t.id], [t.name, t.id], [t.short, t.id],
      ...(t.aliases ?? []).map((alias): [string, string] => [alias, t.id]),
    ]),
  );
  const keywords = config.types.flatMap((t) => (t.aliases ?? []).map((alias) => ({ re: keywordPattern(alias), id: t.id })));
  return (cell) => {
    const base = typeBaseLabel(cell);
    const direct = lookup(base);
    if (direct !== null) return direct;
    const key = normalizeLabel(base);
    const ids = [...new Set(keywords.filter((k) => k.re.test(key)).map((k) => k.id))];
    const id = ids[0];
    return ids.length === 1 && id !== undefined ? { id, repaired: true } : null;
  };
}

/**
 * Builds a tolerant profile lookup (id or name), retrying with successive
 * dotted prefixes stripped (« Externe.Développeur », « NEXTER.ZZ_A NE PAS
 * UTILISER.CdP INFRA SSI » — prefixes surveyed in the PdC reader, Q9).
 * Inputs: the board config. Outputs: cell -> hit or null. Failure: none.
 */
export function createProfileLookup(config: BoardConfig): Lookup {
  const lookup = createTolerantLookup(
    config.profiles.flatMap((p): Array<[string, string]> => [[p.id, p.id], [p.name, p.id]]),
  );
  return (cell) => {
    const direct = lookup(cell);
    if (direct !== null) return direct;
    for (let dot = cell.indexOf("."); dot > 0; dot = cell.indexOf(".", dot + 1)) {
      const hit = lookup(cell.slice(dot + 1).trim());
      if (hit !== null) return hit;
    }
    return null;
  };
}

// The identifying words of a person cell: normalized, letters only, at
// least three characters — matricules and initials never count.
function nameWords(cell: string): string[] {
  return normalizeLabel(cell).split(/[^a-z']+/).filter((word) => word.length >= 3);
}

/**
 * Compiles the domain leads' names into word lists for whole-word matching.
 * Inputs: the raw Responsable cells of PARAM. Outputs: one word list per
 * non-empty name (« BERGER Paul » -> [berger, paul]). Failure: none.
 */
export function leadWordSets(names: readonly string[]): string[][] {
  return names.map(nameWords).filter((words) => words.length > 0);
}

/**
 * True when a person cell names one of the domain leads: every word of a
 * lead's name appears in the cell (« STEFANUTTI, Eric 9103834 » matches
 * « Eric STEFANUTTI »; MARTIN never fires inside MARTINEZ).
 * Inputs: the compiled lead word lists, the raw cell. Failure: none.
 */
export function isDomainLead(leads: readonly string[][], cell: string): boolean {
  const words = new Set(nameWords(cell));
  if (words.size === 0) return false;
  return leads.some((lead) => lead.every((word) => words.has(word)));
}
