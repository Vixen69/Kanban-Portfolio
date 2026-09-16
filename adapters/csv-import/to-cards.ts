// Turning the audited deck into board cards and their events (the real
// load, 2026-08-01 decisions): cards age from the project start date
// (« Début »); a re-import updates the existing cards and adds the new
// ones. Conflict rule: the export wins on FACTS (budgets, charge, domain,
// owner, dates, type — Sciforma truths), the board wins on POSITION as
// soon as a human moved the card there (the arbitration is the PMO's), the
// divergence being reported instead of overwritten.
// ADR 036 (author, 2026-09-16): the DOMAIN is not a fact the export may
// overwrite — a stored card whose domain differs from the export's proposal
// is a conflict the PMO decides one by one (domain-conflicts.ts); the
// refreshed snapshot keeps the board's domain unless « remplacer » was taken.
// ADR 035 (author, 2026-09-16): a card is one project's instance in ONE
// exercise — id « code@année », re-budgeted next year as another card. A
// load targets one exercise and reads or touches only that year's cards;
// cards stored before ADR 035 (bare ids) are that year's when it is the
// current one, and keep their id (the capacity snapshot is remapped).
// Pure: no storage, no clock of its own — the caller passes both.

import type { BoardConfig, Card, CardEvent, CardState, ChargeEntry } from "../../core/types.ts";
import type { CardEventInput } from "../../core/events.ts";
import { lifecycleEvent, movedEvent } from "../../core/events.ts";
import { laneNature } from "../../core/config.ts";
import { foldEvents } from "../../core/state.ts";
import { cardsOfExercise, hasExerciseSuffix } from "../../core/exercise.ts";
import type { DomainConflict, DomainDecision, DomainRef } from "../../core/import-types.ts";
import type { EnrichedCard } from "./enrich.ts";
import { IMPORT_ACTOR, domainConflict, domainDecisionEvent, priorDomainDecisions } from "./domain-conflicts.ts";
import type { PriorDecision } from "./domain-conflicts.ts";
import { baseCardId, cardId, withLegacyIds } from "./card-identity.ts";

export { IMPORT_ACTOR, baseCardId, cardId, withLegacyIds };

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
   * The domain conflicts of the exercise's stored cards (ADR 036), each
   * with the decision applied — null = undecided: the board's value stands
   * and the load is refused by the middle / the CLI.
   */
  domainConflicts: Array<DomainConflict & { decision: DomainDecision | null }>;
  domainReplaced: number;
  domainKept: number;
  domainUndecided: number;
  /** Conflicts silenced by an earlier « garder » against the same proposal. */
  domainKeptByPrior: number;
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
 * already stored (empty arrays on a first load), `now` (injected), the
 * exercise year loaded (default: the config's current one), and the PMO's
 * domain decisions by card id (ADR 036; none = every conflict undecided).
 * Outputs: the LoadPlan — nothing is written here.
 * Failure modes: none; cards whose identity cannot be derived keep a
 * name-based id, so a renamed project creates a new card (the code
 * cross-check of the audit flags that case beforehand).
 */
export function planLoad(
  deck: EnrichedCard[], config: BoardConfig,
  existingCards: Card[], existingEvents: CardEvent[], now: Date, year: number = config.exercise.year,
  decisions: ReadonlyMap<string, DomainDecision> = new Map(),
): LoadPlan {
  const folded = cardsOfExercise(foldEvents(existingCards, existingEvents), year, config.exercise.year);
  const current = new Map(folded.map((c) => [c.id, c]));
  const legacy = new Map(folded.filter((c) => !hasExerciseSuffix(c.id)).map((c) => [c.id, c]));
  const movedByHand = handMovedIds(existingEvents);
  const priors = priorDomainDecisions(existingEvents);
  const plan = emptyPlan(year);
  const deckIds = new Set<string>();
  for (const card of deck) {
    const id = resolveId(card, year, legacy, plan);
    deckIds.add(id);
    const existing = current.get(id);
    if (existing === undefined) {
      plan.cards.push(toCard(id, card, config, plan, year));
      pushCreated(plan, id, card, now);
      continue;
    }
    plan.updated++;
    const domain = settleDomain(plan, existing, card, config, priors.get(id), decisions.get(id), now);
    plan.cards.push(toCard(id, card, config, plan, year, existing.createdAt, domain));
    refreshPosition(plan, id, existing, card, movedByHand, now);
  }
  markAbsences(plan, current, deckIds, now);
  return plan;
}

// The domain the refreshed snapshot carries (ADR 036): the board's own,
// unless the PMO decided « remplacer » on this load — never the export's
// by default. Each decision becomes an event; an undecided conflict keeps
// the board's value and is counted (the load is refused upstream).
function settleDomain(
  plan: LoadPlan, existing: CardState, card: EnrichedCard, config: BoardConfig,
  prior: PriorDecision | undefined, decision: DomainDecision | undefined, now: Date,
): DomainRef {
  const board: DomainRef = { domain: existing.domain, subDomain: existing.subDomain };
  const check = domainConflict(existing, card, config, prior);
  if (check.kind === "kept-by-prior") plan.domainKeptByPrior++;
  if (check.kind !== "conflict") return board;
  plan.domainConflicts.push({ ...check.conflict, decision: decision ?? null });
  if (decision === undefined) {
    plan.domainUndecided++;
    return board;
  }
  plan.events.push(domainDecisionEvent(check.conflict, decision, now.toISOString()));
  if (decision === "garder") {
    plan.domainKept++;
    return check.conflict.board;
  }
  plan.domainReplaced++;
  return check.conflict.proposed;
}

// The position rule (ADR 026): no position in the export = the board's own
// stands; a hand-moved card keeps its column (divergence reported); else
// the export moves the card.
function refreshPosition(
  plan: LoadPlan, id: string, existing: CardState, card: EnrichedCard, movedByHand: ReadonlySet<string>, now: Date,
): void {
  if (!card.positioned) {
    plan.kept++;
    return;
  }
  if (existing.columnId === card.columnId && existing.laneId === card.laneId) return;
  if (movedByHand.has(id)) {
    plan.divergences.push({ title: card.title, fromColumn: existing.columnId, toColumn: card.columnId });
    return;
  }
  pushMoved(plan, id, existing, card, now);
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
    domainConflicts: [], domainReplaced: 0, domainKept: 0, domainUndecided: 0, domainKeptByPrior: 0,
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


// The aging clock starts at the project start date (author, 2026-08-01);
// no start date falls back to the run instant.
function entryTs(card: EnrichedCard, now: Date): string {
  return card.createdAt === null ? now.toISOString() : `${card.createdAt}T00:00:00.000Z`;
}

// The import-time snapshot row. Fields the exports never carry (tags,
// risks, blocage, notes...) stay empty: they are lived in the tool. An
// existing card passes the domain it keeps (settleDomain, ADR 036); a new
// one takes the export's, else the first configured domain.
function toCard(
  id: string, card: EnrichedCard, config: BoardConfig, plan: LoadPlan, year: number,
  keepCreatedAt?: string, domain?: DomainRef,
): Card {
  return {
    id,
    title: card.title,
    domain: domain?.domain ?? card.domainId ?? config.domains[0]?.id ?? "",
    subDomain: domain === undefined ? card.subDomainId : domain.subDomain,

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
