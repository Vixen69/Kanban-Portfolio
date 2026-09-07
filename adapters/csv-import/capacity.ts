// The capacity snapshot (ADR 024): persons from Ress.Profils, joined by
// matricule to the plan de charge's nominative rows, and one assignment
// per person × card for the exercise year. Person ids are opaque (a hash
// of the matricule): the matricule itself never leaves the run, and the
// event log only ever sees the id. A PdC person without a Ress.Profils row
// becomes a stub (name only, no capacity) so the load read-out stays whole.

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
  demandJh: number;
  /** Persons of the PdC never matched (no key at all, generic rows aside). */
  unmatchedPdc: number;
}

/** The built snapshot with its counters, or null when no source allows it. */
export interface CapacityBuild {
  snapshot: CapacitySnapshot;
  stats: CapacityStats;
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
    capacityJh: entry.capacityJh, source: "profils",
  };
}

function stubOf(matricule: string, name: string): Person {
  return {
    id: opaqueId(matricule), name, domain: null, subDomain: null, profileId: null,
    metier: "", external: false, capacityJh: null, source: "pdc",
  };
}

/**
 * Builds the capacity snapshot from the people registry and the plan de
 * charge, over the assembled cards.
 * Inputs: the Ress.Profils table (nullable), the PdC table (nullable), the
 * cards (their `pdcKey` names the PdC project they joined), the config
 * (exercise year), the report.
 * Outputs: the snapshot + stats, or null when neither source is present;
 * side effects: aggregated signalements (stubs created, persons without
 * assignment). Failure modes: none.
 */
export function buildCapacity(
  profils: ProfilsTable | null, pdc: PdcTable | null, cards: readonly EnrichedCard[],
  config: BoardConfig, report: ImportReport,
): CapacityBuild | null {
  if (profils === null && pdc === null) return null;
  const persons = new Map<string, Person>();
  const idByKey = new Map<string, string>();
  for (const entry of profils?.entries ?? []) {
    const primary = entry.keys[0] ?? entry.name;
    const id = opaqueId(primary);
    persons.set(id, personOf(entry, id));
    for (const key of entry.keys) idByKey.set(key, id);
  }
  const tallies = new Map<string, Tally>();
  const assignments = collectAssignments(pdc, cards, persons, idByKey, tallies);
  for (const [message, t] of tallies) warn(report, `${message} : ${tallyLabel(t)}`, "capacité");
  const snapshot: CapacitySnapshot = {
    exerciseYear: config.exercise.year, persons: [...persons.values()], assignments,
  };
  return { snapshot, stats: statsOf(snapshot, cards) };
}

// One assignment per (PdC person, card): the PdC project a card joined
// carries its persons; an unknown matricule gets a stub person.
function collectAssignments(
  pdc: PdcTable | null, cards: readonly EnrichedCard[], persons: Map<string, Person>,
  idByKey: Map<string, string>, tallies: Map<string, Tally>,
): Assignment[] {
  const assignments: Assignment[] = [];
  if (pdc === null) return assignments;
  for (const card of cards) {
    const project = card.pdcKey === null ? undefined : pdc.projects.get(card.pdcKey);
    if (project === undefined) continue;
    for (const [matricule, load] of project.persons) {
      const key = normalizeLabel(matricule);
      let personId = idByKey.get(key);
      if (personId === undefined) {
        personId = opaqueId(key);
        if (!persons.has(personId)) {
          persons.set(personId, stubOf(key, load.name));
          tallyInto(tallies, "personne du plan de charge sans fiche Ress.Profils — capacité inconnue", project.ref.line);
        }
        idByKey.set(key, personId);
      }
      assignments.push({ personId, cardId: cardId(card), jh: load.jh, done: load.done });
    }
  }
  return assignments;
}

function statsOf(snapshot: CapacitySnapshot, cards: readonly EnrichedCard[]): CapacityStats {
  const round2 = (v: number): number => Math.round(v * 100) / 100;
  const covered = new Set(snapshot.assignments.map((a) => a.cardId));
  let demandJh = 0;
  for (const assignment of snapshot.assignments) demandJh = round2(demandJh + assignment.jh);
  let capacityJh = 0;
  for (const person of snapshot.persons) capacityJh = round2(capacityJh + (person.capacityJh ?? 0));
  return {
    persons: snapshot.persons.length,
    stubs: snapshot.persons.filter((p) => p.source === "pdc").length,
    external: snapshot.persons.filter((p) => p.external).length,
    capacityJh,
    assignments: snapshot.assignments.length,
    cardsCovered: cards.filter((card) => covered.has(cardId(card))).length,
    demandJh,
    unmatchedPdc: 0,
  };
}
