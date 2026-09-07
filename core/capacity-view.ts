// The capacity read-out the ☷ view renders (ADR 024/025): what the
// arbitration between domain owners needs, derived from the snapshot and
// the folded cards — head-line figures, the transverse matrix (who consumes
// the shared capacity), loads per domain and per profile, the cards that
// weigh on each transverse domain, the overloaded persons, and the coverage
// caveats that say how far to trust the figures (the last three live in
// capacity-levers.ts). Annual reading: the exercise's planned j.h against
// the declared capacity. Pure; no React.

import type { BoardConfig, CapacitySnapshot, CardState } from "./types.ts";
import { demandByPersonDomain, loadByGroup, personLoads } from "./capacity.ts";
import type { GroupLoad, PersonLoad } from "./capacity.ts";
import { coverageOf, overloadRows, weighingFor } from "./capacity-levers.ts";
import type { Coverage, Overload, WeighingRow } from "./capacity-levers.ts";

export type { Coverage, Overload, WeighingCard, WeighingRow } from "./capacity-levers.ts";

/** Key of persons outside every group (no domain / no profile). */
const NONE = "";
/** Key demandByPersonDomain uses for cards absent from the fold. */
const OUTSIDE = "?";
const NEUTRAL = "#94a3b8";

/** The head-line figures. */
export interface CapacityKpis {
  persons: number;
  external: number;
  capacityJh: number;
  demandJh: number;
  doneJh: number;
  /** demandJh / capacityJh, null when no capacity is known. */
  ratio: number | null;
  overloaded: number;
  cardsWithoutAssignment: number;
}

/** One consumer domain of a transverse domain's people. */
export interface Consumer {
  /** null = cards outside the fold (archived, deleted, unknown). */
  domainId: string | null;
  name: string;
  color: string;
  jh: number;
  /** jh / the transverse domain's capacity, null when unknown. */
  share: number | null;
}

/** A transverse domain: its capacity, and who consumes it. */
export interface TransverseRow {
  domainId: string;
  name: string;
  color: string;
  capacityJh: number;
  demandJh: number;
  ratio: number | null;
  /** Heaviest consumer first. */
  consumers: Consumer[];
}

/** Capacity vs demand of one domain's people (null id = no domain). */
export interface DomainLoadRow extends GroupLoad {
  domainId: string | null;
  name: string;
  color: string;
  transverse: boolean;
  external: number;
}

/** Capacity vs demand of one DSI profile (null id = no profile). */
export interface ProfileLoadRow extends GroupLoad {
  profileId: string | null;
  name: string;
  color: string;
}

/** Everything the capacity view renders. */
export interface CapacityReadout {
  exerciseYear: number;
  kpis: CapacityKpis;
  transverse: TransverseRow[];
  domains: DomainLoadRow[];
  profiles: ProfileLoadRow[];
  weighing: WeighingRow[];
  overloads: Overload[];
  coverage: Coverage;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function ratioOf(demand: number, capacity: number): number | null {
  return capacity > 0 ? round2(demand / capacity) : null;
}

function emptyGroup(key: string): GroupLoad {
  return { key, persons: 0, withoutCapacity: 0, capacityJh: 0, demandJh: 0, doneJh: 0, ratio: null };
}

/**
 * Computes the whole capacity read-out.
 * Inputs: the snapshot, the folded cards shown on the board (their domain
 * and charges), the config (domain/profile order, names, colors,
 * `transverse` flags), the number of weighing cards per transverse domain.
 * Output: the CapacityReadout. Failure: none — an empty snapshot yields
 * zeroed figures and empty lists.
 */
export function computeCapacityReadout(
  snapshot: CapacitySnapshot, cards: readonly CardState[], config: BoardConfig, topCards = 5,
): CapacityReadout {
  const loads = personLoads(snapshot);
  const cardIds = new Set(cards.map((card) => card.id));
  const assignedCards = new Set(
    snapshot.assignments.filter((a) => cardIds.has(a.cardId)).map((a) => a.cardId),
  );
  const overloads = overloadRows(loads, config);
  return {
    exerciseYear: snapshot.exerciseYear,
    kpis: kpisOf(snapshot, loads, cards.length - assignedCards.size, overloads.length),
    transverse: transverseRows(snapshot, cards, config),
    domains: domainRows(snapshot, config),
    profiles: profileRows(snapshot, config),
    weighing: config.domains
      .filter((domain) => domain.transverse === true)
      .map((domain) => weighingFor(domain.id, domain.name, snapshot, cards, config, topCards)),
    overloads,
    coverage: coverageOf(snapshot, cards, assignedCards),
  };
}

function kpisOf(
  snapshot: CapacitySnapshot, loads: PersonLoad[], cardsWithoutAssignment: number, overloaded: number,
): CapacityKpis {
  let capacityJh = 0;
  let demandJh = 0;
  let doneJh = 0;
  for (const load of loads) {
    capacityJh = round2(capacityJh + (load.person.capacityJh ?? 0));
    demandJh = round2(demandJh + load.jh);
    doneJh = round2(doneJh + load.done);
  }
  return {
    persons: snapshot.persons.length,
    external: snapshot.persons.filter((person) => person.external).length,
    capacityJh, demandJh, doneJh,
    ratio: ratioOf(demandJh, capacityJh),
    overloaded, cardsWithoutAssignment,
  };
}

// The arbitration matrix restricted to the transverse domains, consumers
// named and colored after the config (cards outside the fold in grey).
function transverseRows(snapshot: CapacitySnapshot, cards: readonly CardState[], config: BoardConfig): TransverseRow[] {
  const domains = new Map(config.domains.map((domain) => [domain.id, domain]));
  return demandByPersonDomain(snapshot, cards, config)
    .filter((row) => row.transverse)
    .map((row): TransverseRow => {
      const domain = domains.get(row.key);
      const consumers = [...row.byCardDomain.entries()]
        .map(([id, jh]): Consumer => {
          const consumer = id === OUTSIDE ? undefined : domains.get(id);
          return {
            domainId: id === OUTSIDE ? null : id,
            name: consumer?.name ?? (id === OUTSIDE ? "Hors tableau" : id),
            color: consumer?.color ?? NEUTRAL,
            jh, share: ratioOf(jh, row.capacityJh),
          };
        })
        .sort((a, b) => b.jh - a.jh);
      return {
        domainId: row.key, name: domain?.name ?? row.key, color: domain?.color ?? NEUTRAL,
        capacityJh: row.capacityJh, demandJh: row.demandJh, ratio: row.ratio, consumers,
      };
    });
}

// Config domains in order, then the persons outside them: without domain,
// or under a domain id the config no longer knows (kept visible, never lost).
function domainRows(snapshot: CapacitySnapshot, config: BoardConfig): DomainLoadRow[] {
  const groups = new Map(loadByGroup(snapshot, (person) => person.domain ?? NONE).map((g) => [g.key, g]));
  const externals = new Map<string, number>();
  for (const person of snapshot.persons) {
    if (!person.external) continue;
    const key = person.domain ?? NONE;
    externals.set(key, (externals.get(key) ?? 0) + 1);
  }
  const rows = config.domains.map((domain): DomainLoadRow => ({
    ...(groups.get(domain.id) ?? emptyGroup(domain.id)),
    domainId: domain.id, name: domain.name, color: domain.color,
    transverse: domain.transverse === true, external: externals.get(domain.id) ?? 0,
  }));
  const known = new Set(config.domains.map((domain) => domain.id));
  for (const group of groups.values()) {
    if (known.has(group.key)) continue;
    rows.push({
      ...group, domainId: group.key === NONE ? null : group.key,
      name: group.key === NONE ? "Sans domaine" : group.key, color: NEUTRAL,
      transverse: false, external: externals.get(group.key) ?? 0,
    });
  }
  return rows;
}

function profileRows(snapshot: CapacitySnapshot, config: BoardConfig): ProfileLoadRow[] {
  const groups = new Map(loadByGroup(snapshot, (person) => person.profileId ?? NONE).map((g) => [g.key, g]));
  const rows = config.profiles.map((profile): ProfileLoadRow => ({
    ...(groups.get(profile.id) ?? emptyGroup(profile.id)),
    profileId: profile.id, name: profile.name, color: profile.color,
  }));
  const known = new Set(config.profiles.map((profile) => profile.id));
  for (const group of groups.values()) {
    if (known.has(group.key)) continue;
    rows.push({
      ...group, profileId: group.key === NONE ? null : group.key,
      name: group.key === NONE ? "Sans profil" : group.key, color: NEUTRAL,
    });
  }
  return rows;
}
