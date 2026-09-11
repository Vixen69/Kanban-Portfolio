// The capacity read-out the ☷ view renders (ADR 024/025/028): what the
// arbitration between domain owners needs, derived from the snapshot and
// the folded cards — head-line figures, the transverse matrix (who consumes
// the shared capacity, and how much of their load is outside the board),
// loads per domain and per profile with the internal / external split, the
// cards that weigh on each transverse domain, the overloaded persons, and
// the coverage caveats (the last three live in capacity-levers.ts). Annual
// reading: the exercise's planned j.h against the declared capacity. Pure.

import type { BoardConfig, CapacitySnapshot, CardState } from "./types.ts";
import { demandByPersonDomain, emptyGroupLoad, loadByGroup, personLoads } from "./capacity.ts";
import type { GroupLoad, PersonLoad } from "./capacity.ts";
import { coverageOf, overloadRows, weighingFor } from "./capacity-levers.ts";
import type { Coverage, Overload, WeighingRow } from "./capacity-levers.ts";
import { loadByMetier, tensionByMetier } from "./capacity-metiers.ts";
import type { MetierLoad, MetierTension } from "./capacity-metiers.ts";
import { DEFAULT_TENSION } from "./config-exercise.ts";

export type { Coverage, Overload, WeighingCard, WeighingRow } from "./capacity-levers.ts";
export type { MetierLoad, MetierTension } from "./capacity-metiers.ts";

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
  /** Demand of the board's cards, j.h. */
  demandJh: number;
  /** Done on the board's cards, j.h. */
  doneJh: number;
  /** Planned load over the whole plan de charge, j.h. */
  plannedJh: number;
  /** Done over the whole plan de charge, j.h. */
  doneAllJh: number;
  /** Capacity left once every plan is placed, j.h (persons' free days summed, ADR 029). */
  freeJh: number;
  /** Planned beyond capacity, j.h (persons' overloads summed). */
  overJh: number;
  /** Generic demand nobody carries — the « à pourvoir », j.h (ADR 033). */
  genericJh: number;
  /** demandJh / capacityJh, null when no capacity is known. */
  ratio: number | null;
  /** plannedJh / capacityJh — the real engagement; null when unknown. */
  engagement: number | null;
  /** demandJh / plannedJh — what the board weighs in the whole plan. */
  perimeterShare: number | null;
  /** doneAllJh / plannedJh. */
  progress: number | null;
  /** Fraction of the exercise year elapsed at `now` (0..1). */
  yearElapsed: number;
  /** Persons at or above the tension threshold (engagement, else board ratio). */
  overloaded: number;
  cardsWithoutAssignment: number;
  /** Persons absent from the plan de charge (planned load unknown). */
  withoutPlan: number;
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

/** A transverse domain: its loads, and who consumes its board demand. */
export interface TransverseRow extends GroupLoad {
  domainId: string;
  name: string;
  color: string;
  /** Heaviest consumer first. */
  consumers: Consumer[];
}

/** Loads of one domain's people (null id = no domain). */
export interface DomainLoadRow extends GroupLoad {
  domainId: string | null;
  name: string;
  color: string;
  transverse: boolean;
}

/** Loads of one DSI profile (null id = no profile). */
export interface ProfileLoadRow extends GroupLoad {
  profileId: string | null;
  name: string;
  color: string;
}

/** Everything the capacity view renders. */
export interface CapacityReadout {
  exerciseYear: number;
  /** The tension threshold the overloads are filtered on (config). */
  tension: number;
  kpis: CapacityKpis;
  transverse: TransverseRow[];
  domains: DomainLoadRow[];
  profiles: ProfileLoadRow[];
  /** The « types de ressource »: the plan de charge's métiers (ADR 033). */
  metiers: MetierLoad[];
  weighing: WeighingRow[];
  overloads: Overload[];
  tensionByMetier: MetierTension[];
  coverage: Coverage;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function ratioOf(demand: number, capacity: number): number | null {
  return capacity > 0 ? round2(demand / capacity) : null;
}

/**
 * Fraction of an exercise year elapsed at a date, clamped to 0..1.
 * Inputs: now, the year. Output: 0 before the year, 1 after, else the
 * fraction (two decimals). Failure: none.
 */
export function yearElapsed(now: Date, year: number): number {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return round2(Math.min(1, Math.max(0, (now.getTime() - start) / (end - start))));
}

/**
 * Computes the whole capacity read-out.
 * Inputs: the snapshot, the folded cards shown on the board (their domain
 * and charges), the config (domain/profile order, names, colors,
 * `transverse` flags), now (the elapsed share of the year), the number of
 * weighing cards per transverse domain.
 * Output: the CapacityReadout. Failure: none — an empty snapshot yields
 * zeroed figures and empty lists.
 */
export function computeCapacityReadout(
  snapshot: CapacitySnapshot, cards: readonly CardState[], config: BoardConfig, now: Date, topCards = 5,
): CapacityReadout {
  const loads = personLoads(snapshot);
  const cardIds = new Set(cards.map((card) => card.id));
  const assignedCards = new Set(
    snapshot.assignments.filter((a) => cardIds.has(a.cardId)).map((a) => a.cardId),
  );
  // A config served by a middle that predates ADR 033 carries no threshold.
  const tension = config.capacity?.tension ?? DEFAULT_TENSION;
  const overloads = overloadRows(loads, config, tension);
  return {
    exerciseYear: snapshot.exerciseYear,
    tension,
    kpis: kpisOf(snapshot, loads, cards.length - assignedCards.size, overloads.length, now),
    transverse: transverseRows(snapshot, cards, config),
    domains: domainRows(snapshot, config),
    profiles: profileRows(snapshot, config),
    metiers: loadByMetier(snapshot),
    weighing: config.domains
      .filter((domain) => domain.transverse === true)
      .map((domain) => weighingFor(domain.id, domain.name, snapshot, cards, config, topCards)),
    overloads,
    tensionByMetier: tensionByMetier(loads, tension),
    coverage: coverageOf(snapshot, cards, assignedCards),
  };
}

function kpisOf(
  snapshot: CapacitySnapshot, loads: PersonLoad[], cardsWithoutAssignment: number, overloaded: number, now: Date,
): CapacityKpis {
  const sums = { capacityJh: 0, demandJh: 0, doneJh: 0, plannedJh: 0, doneAllJh: 0, freeJh: 0, overJh: 0, withoutPlan: 0 };
  for (const load of loads) {
    sums.capacityJh = round2(sums.capacityJh + (load.person.capacityJh ?? 0));
    sums.demandJh = round2(sums.demandJh + load.jh);
    sums.doneJh = round2(sums.doneJh + load.done);
    sums.freeJh = round2(sums.freeJh + load.freeJh);
    sums.overJh = round2(sums.overJh + load.overJh);
    if (load.person.plannedJh === null) sums.withoutPlan++;
    else {
      sums.plannedJh = round2(sums.plannedJh + load.person.plannedJh);
      sums.doneAllJh = round2(sums.doneAllJh + (load.person.doneJh ?? 0));
    }
  }
  const planKnown = loads.length > sums.withoutPlan;
  let genericJh = 0;
  for (const row of snapshot.generic ?? []) genericJh = round2(genericJh + row.jh);
  return {
    persons: snapshot.persons.length,
    external: snapshot.persons.filter((person) => person.external).length,
    ...sums, genericJh,
    ratio: ratioOf(sums.demandJh, sums.capacityJh),
    engagement: planKnown ? ratioOf(sums.plannedJh, sums.capacityJh) : null,
    perimeterShare: ratioOf(sums.demandJh, sums.plannedJh),
    progress: ratioOf(sums.doneAllJh, sums.plannedJh),
    yearElapsed: yearElapsed(now, snapshot.exerciseYear),
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
      return { ...row, domainId: row.key, name: domain?.name ?? row.key, color: domain?.color ?? NEUTRAL, consumers };
    });
}

// Config domains in order, then the persons outside them: without domain,
// or under a domain id the config no longer knows (kept visible, never lost).
function domainRows(snapshot: CapacitySnapshot, config: BoardConfig): DomainLoadRow[] {
  const groups = new Map(loadByGroup(snapshot, (person) => person.domain ?? NONE).map((g) => [g.key, g]));
  const rows = config.domains.map((domain): DomainLoadRow => ({
    ...(groups.get(domain.id) ?? emptyGroupLoad(domain.id)),
    domainId: domain.id, name: domain.name, color: domain.color, transverse: domain.transverse === true,
  }));
  const known = new Set(config.domains.map((domain) => domain.id));
  for (const group of groups.values()) {
    if (known.has(group.key)) continue;
    rows.push({
      ...group, domainId: group.key === NONE ? null : group.key,
      name: group.key === NONE ? "Sans domaine" : group.key, color: NEUTRAL, transverse: false,
    });
  }
  return rows;
}

function profileRows(snapshot: CapacitySnapshot, config: BoardConfig): ProfileLoadRow[] {
  const groups = new Map(loadByGroup(snapshot, (person) => person.profileId ?? NONE).map((g) => [g.key, g]));
  const rows = config.profiles.map((profile): ProfileLoadRow => ({
    ...(groups.get(profile.id) ?? emptyGroupLoad(profile.id)),
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
