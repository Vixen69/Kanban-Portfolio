// The capacity snapshot (ADR 024/028): persons from Ress.Profils, joined
// by matricule to the plan de charge's nominative rows; one assignment per
// person × card for the exercise year, and per person the PLANNED and DONE
// load over the whole plan de charge (every project, on the board or not —
// the real engagement). Person ids are opaque (a hash of the matricule):
// the matricule itself never leaves the run, and the event log only ever
// sees the id. A PdC person without a Ress.Profils row becomes a stub
// (name only, no capacity) so the load read-out stays whole.

import type { Assignment, BoardConfig, CapacitySnapshot, Person } from "../../core/types.ts";
import { normalizeLabel } from "./normalize.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { EnrichedCard } from "./enrich.ts";
import type { PdcTable } from "./pdc.ts";
import type { ProfilEntry, ProfilsTable } from "./profils.ts";
import { cardId } from "./to-cards.ts";
import { warn } from "./report.ts";
import type { ImportReport } from "./report.ts";

/** Counters for the assembly read-out. */
export interface CapacityStats {
  persons: number;
  stubs: number;
  external: number;
  capacityJh: number;
  assignments: number;
  cardsCovered: number;
  /** Demand of the board's cards, j.h. */
  demandJh: number;
  /** Planned load over the whole plan de charge, j.h. */
  plannedJh: number;
  /** Done over the whole plan de charge, j.h. */
  doneAllJh: number;
  /** Persons of Ress.Profils absent from the plan de charge. */
  withoutPlan: number;
  /** Persons whose capacity comes from their « Disponible ressource » line (ADR 029). */
  capacityFromPdc: number;
  /** Non-nominative project rows set aside from the persons, and their load. */
  genericRows: number;
  genericJh: number;
}

/** The built snapshot with its counters. */
export interface CapacityBuild {
  snapshot: CapacitySnapshot;
  stats: CapacityStats;
}

interface Registry {
  persons: Map<string, Person>;
  idByKey: Map<string, string>;
  tallies: Map<string, Tally>;
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

function personOf(entry: ProfilEntry, id: string): Person {
  return {
    id, name: entry.name, domain: entry.domainId, subDomain: entry.subDomainId,
    profileId: entry.profileId, metier: entry.metier, external: entry.external,
    capacityJh: entry.capacityJh, plannedJh: null, doneJh: null, source: "profils",
  };
}

function stubOf(matricule: string, name: string): Person {
  return {
    id: opaqueId(matricule), name, domain: null, subDomain: null, profileId: null,
    metier: "", external: false, capacityJh: null, plannedJh: null, doneJh: null, source: "pdc",
  };
}

// The person behind a PdC matricule: the Ress.Profils one, else a stub
// created once (tallied) so every nominative row keeps an owner.
function personFor(registry: Registry, matricule: string, name: string, line: number): Person {
  const key = normalizeLabel(matricule);
  let id = registry.idByKey.get(key);
  if (id === undefined) {
    id = opaqueId(key);
    if (!registry.persons.has(id)) {
      registry.persons.set(id, stubOf(key, name));
      tallyInto(registry.tallies, "personne du plan de charge sans fiche Ress.Profils — capacité inconnue", line);
    }
    registry.idByKey.set(key, id);
  }
  const person = registry.persons.get(id);
  if (person === undefined) throw new Error("registry out of sync");
  return person;
}

/**
 * Builds the capacity snapshot from the people registry and the plan de
 * charge, over the assembled cards.
 * Inputs: the Ress.Profils table (nullable), the PdC table (nullable), the
 * cards (their `pdcKey` names the PdC project they joined), the config
 * (exercise year), the report.
 * Outputs: the snapshot + stats, or null when neither source is present;
 * side effects: aggregated signalements (stubs created). Failure: none.
 */
export function buildCapacity(
  profils: ProfilsTable | null, pdc: PdcTable | null, cards: readonly EnrichedCard[],
  config: BoardConfig, report: ImportReport,
): CapacityBuild | null {
  if (profils === null && pdc === null) return null;
  const registry: Registry = { persons: new Map(), idByKey: new Map(), tallies: new Map() };
  for (const entry of profils?.entries ?? []) {
    const id = opaqueId(entry.keys[0] ?? entry.name);
    registry.persons.set(id, personOf(entry, id));
    for (const key of entry.keys) registry.idByKey.set(key, id);
  }
  // Whole-plan totals first (they create the stubs), then the assignments.
  for (const entry of pdc?.persons ?? []) {
    const person = personFor(registry, entry.matricule, entry.name, 0);
    person.plannedJh = entry.plannedJh ?? entry.jh;
    person.doneJh = entry.plannedDone ?? entry.done;
    if (entry.capacityJh !== null) {
      person.capacityJh = entry.capacityJh;
      person.capacitySource = "pdc";
    } else if (person.capacityJh !== null) person.capacitySource = "profils";
  }
  const assignments = collectAssignments(pdc, cards, registry);
  for (const [message, t] of registry.tallies) warn(report, `${message} : ${tallyLabel(t)}`, "capacité");
  const snapshot: CapacitySnapshot = {
    exerciseYear: config.exercise.year, persons: [...registry.persons.values()], assignments,
  };
  return { snapshot, stats: statsOf(snapshot, cards, pdc) };
}

// One assignment per (PdC person, card): the PdC project a card joined
// carries its persons.
function collectAssignments(pdc: PdcTable | null, cards: readonly EnrichedCard[], registry: Registry): Assignment[] {
  const assignments: Assignment[] = [];
  if (pdc === null) return assignments;
  for (const card of cards) {
    const project = card.pdcKey === null ? undefined : pdc.projects.get(card.pdcKey);
    if (project === undefined) continue;
    for (const [matricule, load] of project.persons) {
      const person = personFor(registry, matricule, load.name, project.ref.line);
      assignments.push({ personId: person.id, cardId: cardId(card), jh: load.jh, done: load.done });
    }
  }
  return assignments;
}

function statsOf(snapshot: CapacitySnapshot, cards: readonly EnrichedCard[], pdc: PdcTable | null): CapacityStats {
  const round2 = (v: number): number => Math.round(v * 100) / 100;
  const covered = new Set(snapshot.assignments.map((a) => a.cardId));
  const sums = { capacityJh: 0, demandJh: 0, plannedJh: 0, doneAllJh: 0, withoutPlan: 0 };
  for (const assignment of snapshot.assignments) sums.demandJh = round2(sums.demandJh + assignment.jh);
  for (const person of snapshot.persons) {
    sums.capacityJh = round2(sums.capacityJh + (person.capacityJh ?? 0));
    if (person.plannedJh === null) sums.withoutPlan++;
    else {
      sums.plannedJh = round2(sums.plannedJh + person.plannedJh);
      sums.doneAllJh = round2(sums.doneAllJh + (person.doneJh ?? 0));
    }
  }
  return {
    persons: snapshot.persons.length,
    stubs: snapshot.persons.filter((p) => p.source === "pdc").length,
    external: snapshot.persons.filter((p) => p.external).length,
    assignments: snapshot.assignments.length,
    cardsCovered: cards.filter((card) => covered.has(cardId(card))).length,
    capacityFromPdc: snapshot.persons.filter((p) => p.capacitySource === "pdc").length,
    genericRows: pdc === null ? 0 : pdc.excluded.generic + pdc.excluded.zz + pdc.excluded.roles,
    genericJh: pdc?.excluded.jh ?? 0,
    ...sums,
  };
}
