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

/** A card weighing on a transverse domain — whatever the card's own domain. */
export interface WeighingCard {
  cardId: string;
  title: string;
  codename: string | null;
  domainName: string;
  domainColor: string;
  /** Days the card takes from the domain's resources: named persons + generic rows, j.h. */
  jh: number;
  /** Part of jh carried by no named person (generic rows of the domain, ADR 033). */
  genericJh: number;
  /** jh / the transverse domain's capacity, null when unknown. */
  share: number | null;
}

/** Every card weighing on one transverse domain, heaviest first. */
export interface WeighingRow {
  domainId: string;
  name: string;
  /** Capacity of the domain's people (their « Disponible » lines), j.h. */
  capacityJh: number;
  /** Days every board card takes from the domain's resources, j.h. */
  totalJh: number;
  /** totalJh / capacityJh, null when unknown. */
  share: number | null;
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
 * The cards that weigh on one transverse domain's resources — whatever
 * portfolio the card belongs to (author, 2026-09-11: a SOUTIEN project
 * taking 200 j of CdP A&D weighs on A&D). Resources = the domain's named
 * persons (by their organisation) plus the domain's generic rows (ADR
 * 033); weight = days on the card, share = weight / the domain's capacity.
 * Inputs: the domain id and name, the snapshot, the folded cards, the
 * config (card domain names/colors), how many cards to keep (Infinity =
 * every one).
 * Output: the cards, heaviest first, with the domain's capacity and total.
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
  const perCard = weightsOn(domainId, people, snapshot, cardById);
  let totalJh = 0;
  for (const entry of perCard.values()) totalJh = round2(totalJh + entry.jh);
  const list = [...perCard.entries()].sort((a, b) => b[1].jh - a[1].jh).slice(0, top)
    .flatMap(([cardId, entry]): WeighingCard[] => {
      const card = cardById.get(cardId);
      if (card === undefined) return [];
      const cardDomain = domains.get(card.domain);
      return [{
        cardId, title: card.title, codename: card.codename,
        domainName: cardDomain?.name ?? card.domain, domainColor: cardDomain?.color ?? NEUTRAL,
        jh: entry.jh, genericJh: entry.genericJh, share: ratioOf(entry.jh, capacityJh),
      }];
    });
  return { domainId, name, capacityJh, totalJh, share: ratioOf(totalJh, capacityJh), cards: list };
}

// Days each board card takes from a domain's resources: its named
// persons' assignments plus its generic rows (kept apart in genericJh).
function weightsOn(
  domainId: string, people: Set<string>, snapshot: CapacitySnapshot, cardById: Map<string, CardState>,
): Map<string, { jh: number; genericJh: number }> {
  const perCard = new Map<string, { jh: number; genericJh: number }>();
  const bucket = (cardId: string): { jh: number; genericJh: number } => {
    const entry = perCard.get(cardId) ?? { jh: 0, genericJh: 0 };
    perCard.set(cardId, entry);
    return entry;
  };
  for (const assignment of snapshot.assignments) {
    if (!people.has(assignment.personId) || !cardById.has(assignment.cardId)) continue;
    const entry = bucket(assignment.cardId);
    entry.jh = round2(entry.jh + assignment.jh);
  }
  for (const row of snapshot.generic ?? []) {
    if (row.domain !== domainId || row.cardId === null || !cardById.has(row.cardId)) continue;
    const entry = bucket(row.cardId);
    entry.jh = round2(entry.jh + row.jh);
    entry.genericJh = round2(entry.genericJh + row.jh);
  }
  return perCard;
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
