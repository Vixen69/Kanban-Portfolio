// The arbitration levers of the capacity view (ADR 024/025): the cards
// weighing most on each transverse domain (what a pause, requalification
// or stop would relieve), the persons above 100 %, and the coverage
// caveats that say how far to trust the figures. Pure; no React.

import type { BoardConfig, CapacitySnapshot, CardState } from "./types.ts";
import type { PersonLoad } from "./capacity.ts";
import { loadLevel } from "./capacity.ts";

const NEUTRAL = "#94a3b8";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function ratioOf(demand: number, capacity: number): number | null {
  return capacity > 0 ? round2(demand / capacity) : null;
}

/** A card weighing on a transverse domain. */
export interface WeighingCard {
  cardId: string;
  title: string;
  codename: string | null;
  domainName: string;
  domainColor: string;
  jh: number;
  /** jh / the transverse domain's capacity, null when unknown. */
  share: number | null;
}

/** The heaviest cards on one transverse domain. */
export interface WeighingRow {
  domainId: string;
  name: string;
  cards: WeighingCard[];
}

/** A person at or above the tension threshold, with display names resolved (ADR 033). */
export interface Overload {
  load: PersonLoad;
  domainName: string;
  profileName: string;
  /** The level ranked on (engagement, else board ratio). */
  level: number;
  /** True beyond 100 %. */
  over: boolean;
}

/** How far to trust the figures. */
export interface Coverage {
  /** Persons known only from the plan de charge (no Ress.Profils row). */
  stubs: number;
  unknownCapacity: number;
  /** Persons absent from the plan de charge (planned load unknown). */
  withoutPlan: number;
  assignedCards: number;
  cardsWithoutAssignment: number;
  /** j.h of the cards' charges carried by nobody (generic PdC rows). */
  genericJh: number;
  /** j.h assigned to cards absent from the fold. */
  outsideJh: number;
}

/**
 * The cards that weigh most on one transverse domain's people.
 * Inputs: the domain id and name, the snapshot, the folded cards, the
 * config (card domain names/colors), how many cards to keep.
 * Output: the heaviest cards with their share of the domain's capacity.
 * Failure: none.
 */
export function weighingFor(
  domainId: string, name: string, snapshot: CapacitySnapshot, cards: readonly CardState[],
  config: BoardConfig, top: number,
): WeighingRow {
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const domains = new Map(config.domains.map((domain) => [domain.id, domain]));
  const people = new Set(snapshot.persons.filter((person) => person.domain === domainId).map((p) => p.id));
  let capacityJh = 0;
  for (const person of snapshot.persons) {
    if (people.has(person.id)) capacityJh = round2(capacityJh + (person.capacityJh ?? 0));
  }
  const perCard = new Map<string, number>();
  for (const assignment of snapshot.assignments) {
    if (!people.has(assignment.personId) || !cardById.has(assignment.cardId)) continue;
    perCard.set(assignment.cardId, round2((perCard.get(assignment.cardId) ?? 0) + assignment.jh));
  }
  const list = [...perCard.entries()].sort((a, b) => b[1] - a[1]).slice(0, top)
    .flatMap(([cardId, jh]): WeighingCard[] => {
      const card = cardById.get(cardId);
      if (card === undefined) return [];
      const cardDomain = domains.get(card.domain);
      return [{
        cardId, title: card.title, codename: card.codename,
        domainName: cardDomain?.name ?? card.domain, domainColor: cardDomain?.color ?? NEUTRAL,
        jh, share: ratioOf(jh, capacityJh),
      }];
    });
  return { domainId, name, cards: list };
}

/**
 * The persons at or above the config's tension threshold (whole-plan
 * engagement, else board ratio) — every one of them, most loaded first,
 * with display names resolved (ADR 033: the whole list, not a top).
 * Inputs: the person loads (personLoads), the config (names), the tension
 * threshold. Output: the overloads. Failure: none.
 */
export function overloadRows(loads: PersonLoad[], config: BoardConfig, tension: number): Overload[] {
  const domains = new Map(config.domains.map((domain) => [domain.id, domain.name]));
  const profiles = new Map(config.profiles.map((profile) => [profile.id, profile.name]));
  const rows: Overload[] = [];
  for (const load of loads) {
    const level = loadLevel(load);
    if (level === null || level < tension) continue;
    const { domain, profileId, metier } = load.person;
    rows.push({
      load, level, over: level > 1,
      domainName: domain === null ? "Sans domaine" : (domains.get(domain) ?? domain),
      profileName: profileId === null ? (metier || "Sans profil") : (profiles.get(profileId) ?? profileId),
    });
  }
  return rows;
}

/**
 * How far to trust the figures: stubs, unknown capacities, uncovered cards,
 * generic charge nobody carries, assignments to cards outside the fold.
 * Inputs: the snapshot, the folded cards, the ids of the cards that have
 * at least one assignment. Output: the Coverage counters. Failure: none.
 */
export function coverageOf(snapshot: CapacitySnapshot, cards: readonly CardState[], assignedCards: Set<string>): Coverage {
  const cardIds = new Set(cards.map((card) => card.id));
  let inFold = 0;
  let outsideJh = 0;
  for (const assignment of snapshot.assignments) {
    if (cardIds.has(assignment.cardId)) inFold = round2(inFold + assignment.jh);
    else outsideJh = round2(outsideJh + assignment.jh);
  }
  let chargesJh = 0;
  for (const card of cards) {
    for (const charge of card.chargeByProfile) chargesJh = round2(chargesJh + charge.jh);
  }
  return {
    stubs: snapshot.persons.filter((person) => person.source === "pdc").length,
    unknownCapacity: snapshot.persons.filter((person) => person.capacityJh === null).length,
    withoutPlan: snapshot.persons.filter((person) => person.plannedJh === null).length,
    assignedCards: assignedCards.size,
    cardsWithoutAssignment: cards.length - assignedCards.size,
    genericJh: Math.max(0, round2(chargesJh - inFold)),
    outsideJh,
  };
}
