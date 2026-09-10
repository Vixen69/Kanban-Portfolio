// Capacity read-outs (ADR 024/028): how the exercise year's load weighs on
// persons, on the domains and teams they belong to, and on the DSI
// profiles — against the declared capacities (200 j.h ≈ 1 ETP). Two loads
// per person: the DEMAND of the board's cards (the assignments — the
// perimeter) and the PLANNED load over the whole plan de charge (every
// project, on the board or not — the real engagement). Pure derivations
// over a CapacitySnapshot and the folded cards; no React, no Node. The
// arbitration lens: the demand every domain's cards put on the transverse
// domains' people (config `transverse`).

import type { Assignment, BoardConfig, CapacitySnapshot, CardState, Person } from "./types.ts";

/** Jours-homme of one full-time year — the ETP base (IMPORT-MAPPING.md). */
export const ETP_JH = 200;

/** One person's load: board demand, whole-plan engagement, ratios. */
export interface PersonLoad {
  person: Person;
  /** Demand of the board's cards, j.h (assignments summed). */
  jh: number;
  /** Done on the board's cards, j.h. */
  done: number;
  /** jh / capacityJh, null when the capacity is unknown. */
  ratio: number | null;
  /** plannedJh / capacityJh — the real engagement; null when either is unknown. */
  engagement: number | null;
  /** Planned load outside the board: plannedJh − jh (0 when the plan is unknown). */
  outsideJh: number;
  /** Capacity left once the whole plan is placed: capacityJh − plannedJh when positive (ADR 029). */
  freeJh: number;
  /** Planned beyond the capacity: plannedJh − capacityJh when positive. */
  overJh: number;
  cards: Array<{ cardId: string; jh: number; done: number }>;
}

/** Capacity and planned load of a subset of a group (internal / external). */
export interface LoadSplit {
  persons: number;
  capacityJh: number;
  plannedJh: number;
  /** plannedJh / capacityJh, null without capacity. */
  engagement: number | null;
}

/** Capacity vs loads of one group of persons (domain, team, profile). */
export interface GroupLoad {
  key: string;
  persons: number;
  /** Persons whose capacity is unknown (not summed). */
  withoutCapacity: number;
  /** Persons absent from the plan de charge (planned load unknown). */
  withoutPlan: number;
  capacityJh: number;
  /** Demand of the board's cards, j.h. */
  demandJh: number;
  /** Done on the board's cards, j.h. */
  doneJh: number;
  /** Planned load over the whole plan de charge, j.h (known persons). */
  plannedJh: number;
  /** Done over the whole plan de charge, j.h. */
  doneAllJh: number;
  /** Planned load outside the board, j.h (sum of the persons' outsideJh). */
  outsideJh: number;
  /** Capacity left once every plan is placed, j.h (sum of the persons' freeJh, ADR 029). */
  freeJh: number;
  /** Planned beyond capacity, j.h (sum of the persons' overJh). */
  overJh: number;
  /** demandJh / capacityJh, null when no capacity is known. */
  ratio: number | null;
  /** plannedJh / capacityJh, null when no plan or no capacity is known. */
  engagement: number | null;
  internal: LoadSplit;
  external: LoadSplit;
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

function emptySplit(): LoadSplit {
  return { persons: 0, capacityJh: 0, plannedJh: 0, engagement: null };
}

/**
 * A zeroed GroupLoad under a key (groups without persons, read-outs).
 * Input: the key. Output: the GroupLoad. Failure: none.
 */
export function emptyGroupLoad(key: string): GroupLoad {
  return {
    key, persons: 0, withoutCapacity: 0, withoutPlan: 0, capacityJh: 0, demandJh: 0, doneJh: 0,
    plannedJh: 0, doneAllJh: 0, outsideJh: 0, freeJh: 0, overJh: 0, ratio: null, engagement: null,
    internal: emptySplit(), external: emptySplit(),
  };
}

/**
 * Sums each person's assignments and ranks them by engagement (the whole
 * plan de charge against the capacity), else by board ratio.
 * Inputs: the capacity snapshot. Output: one PersonLoad per person (persons
 * without assignments included, at zero), most loaded first — unknown
 * loads last, then by j.h descending. Failure: none.
 */
export function personLoads(snapshot: CapacitySnapshot): PersonLoad[] {
  const byPerson = new Map<string, PersonLoad>();
  for (const person of snapshot.persons) {
    byPerson.set(person.id, { person, jh: 0, done: 0, ratio: null, engagement: null, outsideJh: 0, freeJh: 0, overJh: 0, cards: [] });
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
    const { capacityJh, plannedJh } = load.person;
    load.ratio = capacityJh === null ? null : ratioOf(load.jh, capacityJh);
    load.engagement = capacityJh === null || plannedJh === null ? null : ratioOf(plannedJh, capacityJh);
    load.outsideJh = plannedJh === null ? 0 : Math.max(0, round2(plannedJh - load.jh));
    const known = capacityJh !== null && plannedJh !== null;
    load.freeJh = known ? Math.max(0, round2(capacityJh - plannedJh)) : 0;
    load.overJh = known ? Math.max(0, round2(plannedJh - capacityJh)) : 0;
    load.cards.sort((a, b) => b.jh - a.jh);
  }
  return loads.sort(compareLoads);
}

/** The figure a person is ranked on: engagement when known, else board ratio. */
export function loadLevel(load: PersonLoad): number | null {
  return load.engagement ?? load.ratio;
}

function compareLoads(a: PersonLoad, b: PersonLoad): number {
  const la = loadLevel(a);
  const lb = loadLevel(b);
  if (la === null && lb !== null) return 1;
  if (la !== null && lb === null) return -1;
  if (la !== null && lb !== null && la !== lb) return lb - la;
  return b.jh - a.jh;
}

function addPerson(group: GroupLoad, load: PersonLoad): void {
  const { person } = load;
  group.persons++;
  if (person.capacityJh === null) group.withoutCapacity++;
  else group.capacityJh = round2(group.capacityJh + person.capacityJh);
  if (person.plannedJh === null) group.withoutPlan++;
  else {
    group.plannedJh = round2(group.plannedJh + person.plannedJh);
    group.doneAllJh = round2(group.doneAllJh + (person.doneJh ?? 0));
  }
  group.demandJh = round2(group.demandJh + load.jh);
  group.doneJh = round2(group.doneJh + load.done);
  group.outsideJh = round2(group.outsideJh + load.outsideJh);
  group.freeJh = round2(group.freeJh + load.freeJh);
  group.overJh = round2(group.overJh + load.overJh);
  const split = person.external ? group.external : group.internal;
  split.persons++;
  split.capacityJh = round2(split.capacityJh + (person.capacityJh ?? 0));
  split.plannedJh = round2(split.plannedJh + (person.plannedJh ?? 0));
}

function finishGroup(group: GroupLoad): void {
  group.ratio = ratioOf(group.demandJh, group.capacityJh);
  group.engagement = group.persons > group.withoutPlan ? ratioOf(group.plannedJh, group.capacityJh) : null;
  group.internal.engagement = ratioOf(group.internal.plannedJh, group.internal.capacityJh);
  group.external.engagement = ratioOf(group.external.plannedJh, group.external.capacityJh);
}

/**
 * Capacity vs loads per group of persons, for any grouping.
 * Inputs: the snapshot, a key function (null = the person is outside every
 * group and ignored). Output: one GroupLoad per key, in first-seen order.
 * Failure: none.
 */
export function loadByGroup(snapshot: CapacitySnapshot, keyOf: (person: Person) => string | null): GroupLoad[] {
  const groups = new Map<string, GroupLoad>();
  for (const load of personLoads(snapshot)) {
    const key = keyOf(load.person);
    if (key === null) continue;
    const group = groups.get(key) ?? emptyGroupLoad(key);
    addPerson(group, load);
    groups.set(key, group);
  }
  for (const group of groups.values()) finishGroup(group);
  return [...groups.values()];
}

/**
 * The arbitration matrix: for each domain persons belong to, the board
 * demand its people receive, split by the domain of the cards consuming
 * them — next to the whole-plan engagement of the same people.
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
  const byKey = new Map(loadByGroup(snapshot, (person) => person.domain).map((group) => [group.key, group]));
  const rows = config.domains.map((domain): DomainDemand => ({
    ...(byKey.get(domain.id) ?? emptyGroupLoad(domain.id)),
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
 * Persons whose load level (engagement, else board ratio) exceeds the
 * threshold, most loaded first.
 * Inputs: the snapshot, a threshold ratio (default 1 = 100 %).
 * Output: the PersonLoads above the threshold. Failure: none.
 */
export function overloaded(snapshot: CapacitySnapshot, threshold = 1): PersonLoad[] {
  return personLoads(snapshot).filter((load) => {
    const level = loadLevel(load);
    return level !== null && level > threshold;
  });
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
