// Turning the audited deck into board cards and their events (the real
// load, 2026-08-01 decisions): cards age from the project start date
// (« Début »); a re-import updates the existing cards and adds the new
// ones. Conflict rule: the export wins on FACTS (budgets, charge, domain,
// owner, dates, type — Sciforma truths), the board wins on POSITION as
// soon as a human moved the card there (the arbitration is the PMO's), the
// divergence being reported instead of overwritten.
// ADR 035 (author, 2026-09-16): a card is one project's instance in ONE
// exercise — id « code@année », re-budgeted next year as another card. A
// load targets one exercise and reads or touches only that year's cards;
// cards stored before ADR 035 (bare ids) are that year's when it is the
// current one, and keep their id (the capacity snapshot is remapped).
// Pure: no storage, no clock of its own — the caller passes both.

import type { BoardConfig, CapacitySnapshot, Card, CardEvent, CardState, ChargeEntry } from "../../core/types.ts";
import type { CardEventInput } from "../../core/events.ts";
import { lifecycleEvent, movedEvent } from "../../core/events.ts";
import { laneNature } from "../../core/config.ts";
import { foldEvents } from "../../core/state.ts";
import { cardsOfExercise, hasExerciseSuffix, instanceId } from "../../core/exercise.ts";
import type { EnrichedCard } from "./enrich.ts";

/** Actor written on every event this loader produces. */
export const IMPORT_ACTOR = "import-csv";

/** What a load would write, and what it deliberately would not. */
export interface LoadPlan {
  /** Cards to upsert (new ones and refreshed existing ones). */
  cards: Card[];
  /** `imported` events for new cards, `moved` for repositioned ones. */
  events: CardEventInput[];
  created: number;
  updated: number;
  moved: number;
  /** Stored csv cards the export no longer lists — marked, never deleted (ADR 026). */
  unlisted: number;
  /** Cards marked absent earlier that the export lists again. */
  relisted: number;
  /** Existing cards left where they are because the export carried no
   * position for them (no jalons file, or no jalon row): the board stands. */
  kept: number;
  /** Cards the export would move but a human already placed by hand. */
  divergences: Array<{ title: string; fromColumn: string; toColumn: string }>;
  /** Charges dropped because their métier stayed unresolved. */
  chargesWithoutProfile: number;
  /** The exercise the load writes into (ADR 035). */
  exercise: number;
  /**
   * Instance ids (cardId) the load mapped onto cards stored before ADR 035
   * (bare ids): instance id → stored id. The capacity snapshot, built with
   * instance ids, is remapped with it (withLegacyIds).
   */
  aliases: Map<string, string>;
}

/**
 * Builds the load plan from the audited deck and the current board state
 * of ONE exercise (ADR 035): only that year's cards are read, refreshed,
 * moved or marked absent — the other years' boards stand.
 * Inputs: the enriched cards, the board config, the cards and events
 * already stored (empty arrays on a first load), `now` (injected), and the
 * exercise year loaded (default: the config's current one).
 * Outputs: the LoadPlan — nothing is written here.
 * Failure modes: none; cards whose identity cannot be derived keep a
 * name-based id, so a renamed project creates a new card (the code
 * cross-check of the audit flags that case beforehand).
 */
export function planLoad(
  deck: EnrichedCard[], config: BoardConfig,
  existingCards: Card[], existingEvents: CardEvent[], now: Date, year: number = config.exercise.year,
): LoadPlan {
  const folded = cardsOfExercise(foldEvents(existingCards, existingEvents), year, config.exercise.year);
  const current = new Map(folded.map((c) => [c.id, c]));
  const legacy = new Map(folded.filter((c) => !hasExerciseSuffix(c.id)).map((c) => [c.id, c]));
  const movedByHand = handMovedIds(existingEvents);
  const plan = emptyPlan(year);
  const deckIds = new Set<string>();
  for (const card of deck) {
    const id = resolveId(card, year, legacy, plan);
    deckIds.add(id);
    const existing = current.get(id);
    plan.cards.push(toCard(id, card, config, plan, year, existing?.createdAt));
    if (existing === undefined) {
      pushCreated(plan, id, card, now);
      continue;
    }
    plan.updated++;
    if (!card.positioned) {
      plan.kept++; // no position in the export: the board's own stands (ADR 026)
      continue;
    }
    if (existing.columnId === card.columnId && existing.laneId === card.laneId) continue;
    if (movedByHand.has(id)) {
      plan.divergences.push({ title: card.title, fromColumn: existing.columnId, toColumn: card.columnId });
      continue;
    }
    pushMoved(plan, id, existing, card, now);
  }
  markAbsences(plan, current, deckIds, now);
  return plan;
}

// The board id of a deck card in this exercise — or the id of the card
// stored before ADR 035 (bare, no year) that it refreshes; that alias is
// kept so the capacity snapshot can follow (withLegacyIds).
function resolveId(card: EnrichedCard, year: number, legacy: Map<string, CardState>, plan: LoadPlan): string {
  const stored = legacy.get(baseCardId(card));
  if (stored === undefined) return cardId(card, year);
  plan.aliases.set(cardId(card, year), stored.id);
  return stored.id;
}

// The export advanced a card nobody placed by hand: the import moves it.
function pushMoved(plan: LoadPlan, id: string, existing: CardState, card: EnrichedCard, now: Date): void {
  plan.moved++;
  plan.events.push(movedEvent(
    id,
    { laneId: existing.laneId, columnId: existing.columnId },
    { laneId: card.laneId, columnId: card.columnId },
    IMPORT_ACTOR, now.toISOString(),
  ));
}

// « Rien n'est écrasé » (ADR 026): a stored csv card the export no longer
// lists is marked absent (unlisted), never deleted; one that comes back is
// relisted. Manual cards and archived cards are left alone.
function markAbsences(plan: LoadPlan, current: Map<string, CardState>, deckIds: Set<string>, now: Date): void {
  const ts = now.toISOString();
  for (const state of current.values()) {
    if (deckIds.has(state.id)) {
      if (state.absentFromLastImport !== null) {
        plan.relisted++;
        plan.events.push(lifecycleEvent("relisted", state.id, IMPORT_ACTOR, ts));
      }
      continue;
    }
    if (state.archived || state.source !== "csv" || state.absentFromLastImport !== null) continue;
    plan.unlisted++;
    plan.events.push(lifecycleEvent("unlisted", state.id, IMPORT_ACTOR, ts));
  }
}

// A new card: its snapshot plus the "imported" event dated at its entry.
function pushCreated(plan: LoadPlan, id: string, card: EnrichedCard, now: Date): void {
  plan.created++;
  plan.events.push({
    ...lifecycleEvent("imported", id, IMPORT_ACTOR, entryTs(card, now), { laneId: card.laneId }),
    toColumn: card.columnId,
  });
}

function emptyPlan(year: number): LoadPlan {
  return {
    cards: [], events: [], created: 0, updated: 0, moved: 0, unlisted: 0, relisted: 0, kept: 0,
    divergences: [], chargesWithoutProfile: 0, exercise: year, aliases: new Map(),
  };
}

/** Ids of cards a human (not this loader) positioned by hand. */
function handMovedIds(events: CardEvent[]): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.type === "moved" && event.actor !== IMPORT_ACTOR) ids.add(event.cardId);
  }
  return ids;
}

/**
 * Stable board id of an imported card in one exercise (ADR 035): its base
 * id suffixed with the year — a re-import of the same year lands on the
 * same card, and next year's instance of the project is another card.
 * Inputs: the enriched card, the exercise year. Outputs: the id.
 * Failure modes: none.
 */
export function cardId(card: EnrichedCard, year: number): string {
  return instanceId(baseCardId(card), year);
}

/**
 * The year-less part of a card id: the PE code when the project has one,
 * else « IMP-<slug of the normalized name> ». Cards stored before ADR 035
 * carry exactly this as their id.
 * Inputs: the enriched card. Outputs: the base id. Failure modes: none.
 */
export function baseCardId(card: EnrichedCard): string {
  if (card.codename !== null) return card.codename;
  const slug = card.normalizedName.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return `IMP-${slug === "" ? "sans-nom" : slug}`;
}

// The aging clock starts at the project start date (author, 2026-08-01);
// no start date falls back to the run instant.
function entryTs(card: EnrichedCard, now: Date): string {
  return card.createdAt === null ? now.toISOString() : `${card.createdAt}T00:00:00.000Z`;
}

// The import-time snapshot row. Fields the exports never carry (tags,
// risks, blocage, notes...) stay empty: they are lived in the tool.
function toCard(
  id: string, card: EnrichedCard, config: BoardConfig, plan: LoadPlan, year: number, keepCreatedAt?: string,
): Card {
  return {
    id,
    title: card.title,
    domain: card.domainId ?? config.domains[0]?.id ?? "",
    subDomain: card.subDomainId,
    laneId: card.laneId, columnId: card.columnId,
    owner: card.owner ?? "",
    criticality: "normal",
    typeId: card.typeId,
    codename: card.codename,
    nature: laneNature(config, card.laneId),
    tags: [], dependencies: [],
    blocked: false, blockedReason: null, blockedSince: null,
    effortEstimated: card.effortEstimated,
    effortConsumed: card.effortConsumed,
    budgetEstimated: card.budgetEstimated,
    budgetConsumed: card.budgetConsumed,
    loadPlan: null, resources: [], notes: "",
    budgetEngaged: card.budgetEngaged,
    budgetRdli: card.budgetRdli,
    chargeByProfile: chargesOf(card, plan),
    contentionProfiles: [], contentionNote: "",
    risks: [], projectConstraints: [], alerts: [],
    dateRdr: card.dateRdr,
    sciformaId: card.codename,
    custom: {},
    createdAt: keepCreatedAt ?? `${card.createdAt ?? new Date(0).toISOString().slice(0, 10)}T00:00:00.000Z`,
    source: "csv",
    exercise: year,
  };
}

// The plan de charge lines a card keeps: those whose métier resolved to a
// profile; the others are counted and dropped.
function chargesOf(card: EnrichedCard, plan: LoadPlan): ChargeEntry[] {
  return card.charges.flatMap((charge): ChargeEntry[] => {
    if (charge.profileId === null) {
      plan.chargesWithoutProfile++;
      return [];
    }
    return [{ profileId: charge.profileId, jh: charge.jh, done: charge.done }];
  });
}

/**
 * The capacity snapshot with its card ids mapped onto the cards the load

 * actually refreshed (plan.aliases: instance id → stored bare id).
 * Inputs: the snapshot, the aliases. Output: a new snapshot (the input is
 * untouched) — the same object when there is nothing to map. Failure: none.
 */
export function withLegacyIds(snapshot: CapacitySnapshot, aliases: Map<string, string>): CapacitySnapshot {
  if (aliases.size === 0) return snapshot;
  const map = <T extends { cardId: string | null }>(rows: T[]): T[] =>
    rows.map((row) => ({ ...row, cardId: row.cardId === null ? null : aliases.get(row.cardId) ?? row.cardId }));
  return {
    ...snapshot,
    assignments: map(snapshot.assignments),
    ...(snapshot.generic === undefined ? {} : { generic: map(snapshot.generic) }),
    ...(snapshot.coutsDemand === undefined ? {} : { coutsDemand: map(snapshot.coutsDemand) }),
  };
}
