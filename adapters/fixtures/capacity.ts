// Synthetic people and assignments for the fixtures adapter (ADR 024): a
// deterministic DSI of invented persons, sized on the cards' demand per
// profile (about one person per 200 j.h of charge, two at least), spread
// over the config's domains, and assigned to the cards' per-profile charges
// (chargeByProfile) so the capacity read-outs have something to say — an
// overall load around 1.0 with overloaded people, idle profiles and a few
// unknown capacities. Every name is invented.

import type { Assignment, BoardConfig, Card, CapacitySnapshot, Person } from "../../core/types.ts";
import { ETP_JH } from "../../core/capacity.ts";
import { createSeededRandom } from "./random.ts";
import type { SeededRandom } from "./random.ts";

const FIRST_NAMES = [
  "Alice", "Bruno", "Chloé", "David", "Émilie", "Farid", "Gaëlle", "Hugo", "Inès", "Julien",
  "Karim", "Léa", "Mathis", "Nora", "Oscar", "Pauline", "Quentin", "Rania", "Samuel", "Théa",
];
const LAST_NAMES = [
  "MERLE", "DUBOIS", "NGUYEN", "ROSSI", "BERNARD", "KOVAC", "LAMBERT", "OKAFOR", "PETIT", "SCHMITT",
  "MOREAU", "HADDAD", "GARCIA", "LEROY", "FONTAINE", "ROUX", "MARTIN", "SILVA", "BLANC", "DIALLO",
];
/** Persons per profile: at least two, else one per 170 j.h of demand — with
 * the capacity bands below (part-timers, unknowns) the DSI lands near a 1.0
 * overall load, a third of the people overloaded, a few idle. */
const MIN_PERSONS_PER_PROFILE = 2;
const DEMAND_PER_PERSON_JH = ETP_JH * 0.85;
/** Capacity bands (j.h, weight %): full time, part time, unknown. */
const CAPACITY_BANDS: Array<[number | null, number]> = [[200, 70], [160, 12], [100, 10], [null, 8]];
const EXTERNAL_SHARE = 0.25;
const SHARED_CHARGE_SHARE = 0.4;

/** What the generator needs from a card: its id and per-profile charges. */
export type ChargedCard = Pick<Card, "id" | "chargeByProfile">;

/**
 * Generates the fixtures capacity snapshot for a board.
 * Inputs: the board config (profiles, domains, exercise year), the cards
 * (their chargeByProfile sizes the people of each profile and is split
 * among them), the seed. Output: a CapacitySnapshot whose assignments sum
 * back, per card and profile, to the card's charge (two decimals).
 * Deterministic for one seed. Failure modes: none.
 */
export function generateCapacity(config: BoardConfig, cards: readonly ChargedCard[], seed: number): CapacitySnapshot {
  const random = createSeededRandom(seed ^ 0x5ca1ab1e);
  const persons = generatePersons(config, demandByProfile(cards), random);
  const byProfile = new Map<string, Person[]>();
  for (const person of persons) {
    if (person.profileId === null) continue;
    byProfile.set(person.profileId, [...(byProfile.get(person.profileId) ?? []), person]);
  }
  const assignments: Assignment[] = [];
  for (const card of cards) {
    for (const charge of card.chargeByProfile) {
      const pool = byProfile.get(charge.profileId) ?? [];
      if (pool.length > 0) assignments.push(...split(card.id, charge, pool, random));
    }
  }
  return { exerciseYear: config.exercise.year, persons, assignments };
}

function demandByProfile(cards: readonly ChargedCard[]): Map<string, number> {
  const demand = new Map<string, number>();
  for (const card of cards) {
    for (const charge of card.chargeByProfile) {
      demand.set(charge.profileId, (demand.get(charge.profileId) ?? 0) + charge.jh);
    }
  }
  return demand;
}

function generatePersons(config: BoardConfig, demand: Map<string, number>, random: SeededRandom): Person[] {
  const persons: Person[] = [];
  const used = new Set<string>();
  for (const profile of config.profiles) {
    const count = Math.max(MIN_PERSONS_PER_PROFILE, Math.round((demand.get(profile.id) ?? 0) / DEMAND_PER_PERSON_JH));
    for (let i = 0; i < count; i++) {
      const domain = random.pick(config.domains);
      const subDomains = domain.subDomains ?? [];
      persons.push({
        id: `p-${String(persons.length + 1).padStart(4, "0")}`,
        name: uniqueName(random, used),
        domain: domain.id,
        subDomain: subDomains.length === 0 ? null : random.pick(subDomains).id,
        profileId: profile.id,
        metier: profile.name,
        external: random.next() < EXTERNAL_SHARE,
        capacityJh: pickCapacity(random),
        source: "profils",
      });
    }
  }
  return persons;
}

function uniqueName(random: SeededRandom, used: Set<string>): string {
  for (;;) {
    const name = `${random.pick(FIRST_NAMES)} ${random.pick(LAST_NAMES)}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
}

function pickCapacity(random: SeededRandom): number | null {
  const roll = random.int(1, 100);
  let acc = 0;
  for (const [value, weight] of CAPACITY_BANDS) {
    acc += weight;
    if (roll <= acc) return value;
  }
  return CAPACITY_BANDS[0]?.[0] ?? null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// One or two persons carry a charge; a shared charge is split so the pair
// sums back to the card's figure (the read-outs cross-check it).
function split(
  cardId: string, charge: { jh: number; done: number }, pool: readonly Person[], random: SeededRandom,
): Assignment[] {
  const [first, second] = random.shuffle(pool);
  if (first === undefined) return [];
  if (second === undefined || random.next() >= SHARED_CHARGE_SHARE) {
    return [{ personId: first.id, cardId, jh: charge.jh, done: charge.done }];
  }
  const share = random.int(30, 70) / 100;
  const jh = round2(charge.jh * share);
  const done = round2(charge.done * share);
  return [
    { personId: first.id, cardId, jh, done },
    { personId: second.id, cardId, jh: round2(charge.jh - jh), done: round2(charge.done - done) },
  ];
}
