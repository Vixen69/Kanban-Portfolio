// The capacity snapshot (ADR 024/028/029). Since the author's call of
// 2026-09-10, the plan de charge is the ONLY source of the persons: its
// nominative resources, with their « Disponible ressource » line as
// capacity and their « Planifiée projet » line as planned load; the
// organisation path gives the domain through PARAM (as a raw Projets
// export does), the métier gives the DSI profile and the « Externe » flag.
// Ress.Profils only fills a domain the path could not (fallback, counted).
// Person ids are opaque (a hash of the matricule): the matricule itself
// never leaves the run, and the event log only ever sees the id.

import type { Assignment, BoardConfig, CapacitySnapshot, GenericDemand, Person } from "../../core/types.ts";
import { normalizeLabel } from "./normalize.ts";
import { createDomainLookup } from "./domains.ts";
import type { Lookup } from "./domains.ts";
import type { EnrichedCard } from "./enrich.ts";
import type { PdcPerson, PdcTable } from "./pdc.ts";
import type { ParamTable } from "./param.ts";
import type { ProfilsTable } from "./profils.ts";
import { cardId } from "./to-cards.ts";
import { warn } from "./report.ts";
import type { ImportReport } from "./report.ts";

/** Counters for the assembly read-out. */
export interface CapacityStats {
  persons: number;
  external: number;
  capacityJh: number;
  /** Persons without a « Disponible ressource » line (capacity unknown). */
  withoutCapacity: number;
  /** Persons whose organisation path resolved to a board domain (PARAM or label). */
  domainViaPath: number;
  /** Persons whose domain came from Ress.Profils (fallback). */
  domainViaProfils: number;
  domainUnknown: number;
  assignments: number;
  cardsCovered: number;
  /** Demand of the board's cards, j.h. */
  demandJh: number;
  /** Planned load over the whole plan de charge, j.h. */
  plannedJh: number;
  /** Done over the whole plan de charge, j.h. */
  doneAllJh: number;
  /** Non-nominative project rows set aside from the persons, and their load. */
  genericRows: number;
  genericJh: number;
}

/** The built snapshot with its counters. */
export interface CapacityBuild {
  snapshot: CapacitySnapshot;
  stats: CapacityStats;
}

interface DomainHit {
  domain: string | null;
  subDomain: string | null;
  via: "path" | "profils" | null;
}

// FNV-1a 64-bit over the normalized matricule — a stable opaque id, no
// crypto needed (pseudonymization inside the tool, not secrecy).
function opaqueId(matricule: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const char of normalizeLabel(matricule)) {
    hash ^= BigInt(char.codePointAt(0) ?? 0);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `p-${hash.toString(16).padStart(16, "0")}`;
}

// Domain of a resource: the organisation path through PARAM, else one of
// the path's segments read as a domain label (last first), else
// Ress.Profils by matricule (persons only), else unknown.
function domainOf(
  organisation: string, matricule: string, param: ParamTable | null, domainLookup: Lookup, profils: ProfilsTable | null,
): DomainHit {
  const path = normalizeLabel(organisation);
  const viaParam = path === "" || param === null ? undefined : param.byPath.get(path);
  if (viaParam !== undefined && viaParam.domainId !== null) {
    return { domain: viaParam.domainId, subDomain: viaParam.subDomainId, via: "path" };
  }
  const segments = organisation.split(".").map((s) => s.trim()).filter((s) => s !== "");
  for (let i = segments.length - 1; i >= 0; i--) {
    const hit = domainLookup(segments[i] ?? "");
    if (hit !== null) return { domain: hit.id, subDomain: null, via: "path" };
  }
  const profil = matricule === "" ? undefined : profils?.byKey.get(normalizeLabel(matricule));
  if (profil !== undefined && profil.domainId !== null) {
    return { domain: profil.domainId, subDomain: profil.subDomainId, via: "profils" };
  }
  return { domain: null, subDomain: null, via: null };
}

function personOf(entry: PdcPerson, id: string, hit: DomainHit): Person {
  const person: Person = {
    id, name: entry.name, domain: hit.domain, subDomain: hit.subDomain,
    profileId: entry.profileId, metier: entry.metier, external: entry.external,
    capacityJh: entry.capacityJh, plannedJh: entry.plannedJh ?? entry.jh, doneJh: entry.plannedDone ?? entry.done,
    source: "pdc",
  };
  if (entry.capacityJh !== null) person.capacitySource = "pdc";
  return person;
}

/**
 * Builds the capacity snapshot from the plan de charge, over the assembled
 * cards.
 * Inputs: the Ress.Profils table (nullable — domain fallback only), the PdC
 * table (nullable), the cards (their `pdcKey` names the PdC project they
 * joined), the config (exercise year, domains), the report, the PARAM
 * table (nullable — organisation path → domain).
 * Outputs: the snapshot + stats, or null without a plan de charge; side
 * effects: a signalement when an assignment names an unknown matricule.
 * Failure: none.
 */
export function buildCapacity(
  profils: ProfilsTable | null, pdc: PdcTable | null, cards: readonly EnrichedCard[],
  config: BoardConfig, report: ImportReport, param: ParamTable | null,
): CapacityBuild | null {
  if (pdc === null) return null;
  const domainLookup = createDomainLookup(config);
  const persons: Person[] = [];
  const idByMatricule = new Map<string, string>();
  const via = { path: 0, profils: 0, none: 0 };
  for (const entry of pdc.persons) {
    const id = opaqueId(entry.matricule);
    const hit = domainOf(entry.organisation, entry.matricule, param, domainLookup, profils);
    via[hit.via ?? "none"]++;
    persons.push(personOf(entry, id, hit));
    idByMatricule.set(normalizeLabel(entry.matricule), id);
  }
  const assignments = collectAssignments(pdc, cards, idByMatricule, report);
  const generic = collectGeneric(pdc, cards, param, domainLookup, profils);
  const snapshot: CapacitySnapshot = { exerciseYear: config.exercise.year, persons, assignments, generic };
  return { snapshot, stats: statsOf(snapshot, cards, pdc, via) };
}

// The non-nominative rows as demand « à pourvoir » (ADR 033): by métier,
// with the domain of their organisation and the board card their project
// joined (null when the project is outside the board).
function collectGeneric(
  pdc: PdcTable, cards: readonly EnrichedCard[], param: ParamTable | null, domainLookup: Lookup, profils: ProfilsTable | null,
): GenericDemand[] {
  const cardByPdcKey = new Map<string, string>();
  for (const card of cards) {
    if (card.pdcKey !== null) cardByPdcKey.set(card.pdcKey, cardId(card));
  }
  return pdc.generic.map((row): GenericDemand => ({
    metier: row.metier, domain: domainOf(row.organisation, "", param, domainLookup, profils).domain,
    cardId: cardByPdcKey.get(row.projectKey) ?? null, jh: row.jh, done: row.done,
  }));
}

// One assignment per (PdC person, card): the PdC project a card joined
// carries its nominative persons.
function collectAssignments(
  pdc: PdcTable, cards: readonly EnrichedCard[], idByMatricule: Map<string, string>, report: ImportReport,
): Assignment[] {
  const assignments: Assignment[] = [];
  let unknown = 0;
  for (const card of cards) {
    const project = card.pdcKey === null ? undefined : pdc.projects.get(card.pdcKey);
    if (project === undefined) continue;
    for (const [matricule, load] of project.persons) {
      const personId = idByMatricule.get(normalizeLabel(matricule));
      if (personId === undefined) {
        unknown++;
        continue;
      }
      assignments.push({ personId, cardId: cardId(card), jh: load.jh, done: load.done });
    }
  }
  if (unknown > 0) warn(report, `${unknown} affectation(s) sur un matricule absent des personnes du plan de charge — ignorée(s)`, "capacité");
  return assignments;
}

function statsOf(
  snapshot: CapacitySnapshot, cards: readonly EnrichedCard[], pdc: PdcTable,
  via: { path: number; profils: number; none: number },
): CapacityStats {
  const round2 = (v: number): number => Math.round(v * 100) / 100;
  const covered = new Set(snapshot.assignments.map((a) => a.cardId));
  const sums = { capacityJh: 0, demandJh: 0, plannedJh: 0, doneAllJh: 0 };
  for (const assignment of snapshot.assignments) sums.demandJh = round2(sums.demandJh + assignment.jh);
  for (const person of snapshot.persons) {
    sums.capacityJh = round2(sums.capacityJh + (person.capacityJh ?? 0));
    sums.plannedJh = round2(sums.plannedJh + (person.plannedJh ?? 0));
    sums.doneAllJh = round2(sums.doneAllJh + (person.doneJh ?? 0));
  }
  return {
    persons: snapshot.persons.length,
    external: snapshot.persons.filter((p) => p.external).length,
    withoutCapacity: snapshot.persons.filter((p) => p.capacityJh === null).length,
    domainViaPath: via.path, domainViaProfils: via.profils, domainUnknown: via.none,
    assignments: snapshot.assignments.length,
    cardsCovered: cards.filter((card) => covered.has(cardId(card))).length,
    genericRows: pdc.excluded.generic + pdc.excluded.zz + pdc.excluded.roles,
    genericJh: pdc.excluded.jh,
    ...sums,
  };
}
