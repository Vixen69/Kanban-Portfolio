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

/**
 * Builds a tolerant type lookup (id, name or short) over the base label.
 * Inputs: the board config. Outputs: cell -> hit or null. Failure: none.
 */
export function createTypeLookup(config: BoardConfig): Lookup {
  const lookup = createTolerantLookup(
    config.types.flatMap((t): Array<[string, string]> => [[t.id, t.id], [t.name, t.id], [t.short, t.id]]),
  );
  return (cell) => lookup(typeBaseLabel(cell));
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
