// Capacity read-outs (ADR 024): how the exercise year's assignments weigh on
// persons, on the domains and teams they belong to, and on the DSI
// profiles — against the declared capacities (200 j.h ≈ 1 ETP). Pure
// derivations over a CapacitySnapshot and the folded cards; no React, no
// Node. The arbitration lens: the demand every domain's cards put on the
// transverse domains' people (config `transverse`).

import type { Assignment, BoardConfig, CapacitySnapshot, CardState, Person } from "./types.ts";

/** Jours-homme of one full-time year — the ETP base (IMPORT-MAPPING.md). */
export const ETP_JH = 200;

/** One person's load: assignments summed, ratio against capacity. */
export interface PersonLoad {
  person: Person;
  jh: number;
  done: number;
  /** jh / capacityJh, null when the capacity is unknown. */
  ratio: number | null;
  cards: Array<{ cardId: string; jh: number; done: number }>;
}

/** Capacity vs demand of one group of persons (domain, team, profile). */
export interface GroupLoad {
  key: string;
  persons: number;
  /** Persons of the group whose capacity is unknown (not summed). */
  withoutCapacity: number;
  capacityJh: number;
  demandJh: number;
  doneJh: number;
  /** demandJh / capacityJh, null when no capacity is known. */
  ratio: number | null;
}

/** A domain's demand, split by the domain of the cards that consume it. */
export interface DomainDemand extends GroupLoad {
  transverse: boolean;
  /** card domain id (or "?" for cards outside the fold) -> j.h demanded. */
  byCardDomain: Map<string, number>;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function ratioOf(demand: number, capacity: number): number | null {
  return capacity > 0 ? round2(demand / capacity) : null;
}

/**
 * Sums each person's assignments and ranks them by load ratio.
 * Inputs: the capacity snapshot. Output: one PersonLoad per person (persons
 * without assignments included, at zero), sorted by ratio descending —
 * unknown capacities last, then by j.h descending. Failure: none.
 */
export function personLoads(snapshot: CapacitySnapshot): PersonLoad[] {
  const byPerson = new Map<string, PersonLoad>();
  for (const person of snapshot.persons) {
    byPerson.set(person.id, { person, jh: 0, done: 0, ratio: null, cards: [] });
  }
  for (const assignment of snapshot.assignments) {
    const load = byPerson.get(assignment.personId);
    if (load === undefined) continue;
    load.jh = round2(load.jh + assignment.jh);
    load.done = round2(load.done + assignment.done);
    load.cards.push({ cardId: assignment.cardId, jh: assignment.jh, done: assignment.done });
  }
  const loads = [...byPerson.values()];
  for (const load of loads) {
    load.ratio = load.person.capacityJh === null ? null : ratioOf(load.jh, load.person.capacityJh);
    load.cards.sort((a, b) => b.jh - a.jh);
  }
  return loads.sort(compareLoads);
}

function compareLoads(a: PersonLoad, b: PersonLoad): number {
  if (a.ratio === null && b.ratio !== null) return 1;
  if (a.ratio !== null && b.ratio === null) return -1;
  if (a.ratio !== null && b.ratio !== null && a.ratio !== b.ratio) return b.ratio - a.ratio;
  return b.jh - a.jh;
}

/**
 * Capacity vs demand per group of persons, for any grouping.
 * Inputs: the snapshot, a key function (null = the person is outside every
 * group and ignored). Output: one GroupLoad per key, in first-seen order.
 * Failure: none.
 */
export function loadByGroup(snapshot: CapacitySnapshot, keyOf: (person: Person) => string | null): GroupLoad[] {
  const groups = new Map<string, GroupLoad>();
  const keyByPerson = new Map<string, string>();
  for (const person of snapshot.persons) {
    const key = keyOf(person);
    if (key === null) continue;
    keyByPerson.set(person.id, key);
    const group = groups.get(key) ?? { key, persons: 0, withoutCapacity: 0, capacityJh: 0, demandJh: 0, doneJh: 0, ratio: null };
    group.persons++;
    if (person.capacityJh === null) group.withoutCapacity++;
    else group.capacityJh = round2(group.capacityJh + person.capacityJh);
    groups.set(key, group);
  }
  for (const assignment of snapshot.assignments) {
    const key = keyByPerson.get(assignment.personId);
    const group = key === undefined ? undefined : groups.get(key);
    if (group === undefined) continue;
    group.demandJh = round2(group.demandJh + assignment.jh);
    group.doneJh = round2(group.doneJh + assignment.done);
  }
  for (const group of groups.values()) group.ratio = ratioOf(group.demandJh, group.capacityJh);
  return [...groups.values()];
}

/**
 * The arbitration matrix: for each domain persons belong to, the demand its
 * people receive, split by the domain of the cards consuming them.
 * Inputs: the snapshot, the folded cards (their domain), the config
 * (domain order and `transverse` flags). Output: one DomainDemand per
 * config domain (domains without persons included, at zero), in config
 * order; a card absent from the fold counts under "?".
 * Failure: none.
 */
export function demandByPersonDomain(
  snapshot: CapacitySnapshot, cards: readonly CardState[], config: BoardConfig,
): DomainDemand[] {
  const cardDomain = new Map(cards.map((card) => [card.id, card.domain]));
  const personDomain = new Map(snapshot.persons.map((person) => [person.id, person.domain]));
  const groups = loadByGroup(snapshot, (person) => person.domain);
  const byKey = new Map(groups.map((group) => [group.key, group]));
  const rows = config.domains.map((domain): DomainDemand => ({
    ...(byKey.get(domain.id) ?? { key: domain.id, persons: 0, withoutCapacity: 0, capacityJh: 0, demandJh: 0, doneJh: 0, ratio: null }),
    transverse: domain.transverse === true,
    byCardDomain: new Map(),
  }));
  const rowByKey = new Map(rows.map((row) => [row.key, row]));
  for (const assignment of snapshot.assignments) {
    const row = rowByKey.get(personDomain.get(assignment.personId) ?? "");
    if (row === undefined) continue;
    const consumer = cardDomain.get(assignment.cardId) ?? "?";
    row.byCardDomain.set(consumer, round2((row.byCardDomain.get(consumer) ?? 0) + assignment.jh));
  }
  return rows;
}

/**
 * Persons whose load exceeds their capacity, most loaded first.
 * Inputs: the snapshot, a threshold ratio (default 1 = 100 %).
 * Output: the PersonLoads above the threshold. Failure: none.
 */
export function overloaded(snapshot: CapacitySnapshot, threshold = 1): PersonLoad[] {
  return personLoads(snapshot).filter((load) => load.ratio !== null && load.ratio > threshold);
}

/** Total j.h of the assignments (convenience for read-outs). Failure: none. */
export function totalDemand(assignments: readonly Assignment[]): { jh: number; done: number } {
  let jh = 0;
  let done = 0;
  for (const assignment of assignments) {
    jh = round2(jh + assignment.jh);
    done = round2(done + assignment.done);
  }
  return { jh, done };
}
