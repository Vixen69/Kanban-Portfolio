// Turning the audited deck into board cards and their events (the real
// load, 2026-08-01 decisions): cards age from the project start date
// (« Début »); a re-import updates the existing cards and adds the new
// ones. Conflict rule: the export wins on FACTS (budgets, charge, domain,
// owner, dates, type — Sciforma truths), the board wins on POSITION as
// soon as a human moved the card there (the arbitration is the PMO's), the
// divergence being reported instead of overwritten. ADR 054 (author,
// 2026-09-30): the export wins only on the facts it CARRIES — a fact the
// files leave blank keeps the stored value (keep-facts.ts), never erased.
// ADR 036 (author, 2026-09-16): the DOMAIN is not a fact the export may
// overwrite — a stored card whose domain differs from the export's proposal
// is a conflict the PMO decides one by one (domain-conflicts.ts); the
// refreshed snapshot keeps the board's domain unless « remplacer » was taken.
// ADR 035 (author, 2026-09-16): a card is one project's instance in ONE
// exercise — id « code@année », re-budgeted next year as another card. A
// load targets one exercise and reads or touches only that year's cards;
// cards stored before ADR 035 (bare ids) are that year's when it is the
// current one, and keep their id (the capacity snapshot is remapped).
// ADR 058 (idempotence, 2026-09-30): the plan reads the restore-filtered
// log (board-reading.ts); a reorder or a canal-only move never pins a card
// and the export never places the canal of an existing card; a card
// deleted on the board is skipped, never re-created; an « imported » event
// is never dated after the load. ADR 059: a hand-made card carrying the
// export's code is adopted, not duplicated (load-identity.ts).
// Pure: no storage, no clock of its own — the caller passes both.

import type { BoardConfig, Card, CardEvent, CardState } from "../../core/types.ts";
import type { CardEventInput } from "../../core/events.ts";
import { lifecycleEvent, movedEvent } from "../../core/events.ts";
import type { DomainConflict, DomainDecision, DomainRef } from "../../core/import-types.ts";
import type { EnrichedCard } from "./enrich.ts";
import { IMPORT_ACTOR, domainConflict, domainDecisionEvent } from "./domain-conflicts.ts";
import type { PriorDecision } from "./domain-conflicts.ts";
import { baseCardId, cardId, withLegacyIds } from "./card-identity.ts";
import { readBoard } from "./board-reading.ts";
import type { BoardReading } from "./board-reading.ts";
import { resolveIdentity } from "./load-identity.ts";
import type { AdoptedCard } from "./load-identity.ts";
import { keepStoredFacts, keptFactCards, keptFactCounts } from "./keep-facts.ts";
import type { KeptFactCards, KeptFactCount, KeptTally } from "./keep-facts.ts";
import { toCard } from "./card-row.ts";

export { IMPORT_ACTOR, baseCardId, cardId, withLegacyIds };
export type { AdoptedCard };

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
  /** Facts the files left blank on existing cards: the stored value stood (ADR 054). */
  factsKept: KeptFactCount[];
  /** The same facts with the cards that kept them named (ADR 055). */
  factsKeptCards: KeptFactCards[];
  /** New cards whose domain nothing resolved: they take the first configured domain (reported, ADR 055). */
  domainFallback: string[];
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
   * Instance ids (cardId) the load mapped onto another board card: one
   * stored before ADR 035 (bare id) or a hand-made card it adopted (ADR
   * 059) — instance id → board id. The capacity snapshot, built with
   * instance ids, is remapped with it (withLegacyIds).
   */
  aliases: Map<string, string>;
  /** Deck cards whose board card was deleted there (ADR 058): skipped, never re-created — by board id. */
  deletedSkipped: string[];
  /** Hand-made cards the load adopted instead of creating a duplicate (ADR 059). */
  adopted: AdoptedCard[];
  /** Identity questions the load could not settle alone, plain French (ADR 058/059). */
  identityDoubts: string[];
}

/**
 * Builds the load plan from the audited deck and the current board state
 * of ONE exercise (ADR 035): only that year's cards are read, refreshed,
 * moved or marked absent — the other years' boards stand. The log is read
 * through the restores (ADR 042/058): what a restore undid is not read.
 * Inputs: the enriched cards, the board config, the cards and events
 * already stored (empty arrays on a first load), `now` (injected), the
 * exercise year loaded (default: the config's current one), and the PMO's
 * domain decisions by card id (ADR 036; none = every conflict undecided).
 * Outputs: the LoadPlan — nothing is written here.
 * Failure modes: none; cards whose identity cannot be derived keep a
 * name-based id, so a renamed project creates a new card (the code
 * cross-check of the audit flags that case beforehand); a second deck
 * card on an id already planned is left out and said (identityDoubts).
 */
export function planLoad(
  deck: EnrichedCard[], config: BoardConfig,
  existingCards: Card[], existingEvents: CardEvent[], now: Date, year: number = config.exercise.year,
  decisions: ReadonlyMap<string, DomainDecision> = new Map(),
): LoadPlan {
  const reading = readBoard(existingCards, existingEvents, year, config.exercise.year);
  const plan = emptyPlan(year);
  const stored = new Map(existingCards.map((c) => [c.id, c]));
  const tally: KeptTally = new Map();
  const deckIds = new Map<string, string>();
  for (const card of deck) {
    const identity = resolveIdentity(card, year, reading, plan);
    const first = deckIds.get(identity.id);
    if (first !== undefined) {
      plan.identityDoubts.push(`identité « ${identity.id} » portée par deux projets de l’export (« ${first} », « ${card.title} ») — seul le premier est chargé`);
      continue;
    }
    deckIds.set(identity.id, card.title);
    if (identity.kind === "deleted") {
      plan.deletedSkipped.push(identity.id);
      continue;
    }
    const existing = reading.current.get(identity.id);
    if (existing === undefined) {
      createCard(plan, identity.id, card, config, now);
      continue;
    }
    plan.updated++;
    const domain = settleDomain(plan, existing, card, config, reading.priors.get(identity.id), decisions.get(identity.id), now);
    plan.cards.push(keepStoredFacts(toCard(identity.id, card, config, plan, year, existing.createdAt, domain), stored.get(identity.id), tally));
    refreshPosition(plan, identity.id, existing, card, reading, now);
  }
  markAbsences(plan, reading.current, new Set(deckIds.keys()), now);
  plan.factsKept = keptFactCounts(tally);
  plan.factsKeptCards = keptFactCards(tally);
  return plan;
}

// A new card: its snapshot plus the « imported » event.
function createCard(plan: LoadPlan, id: string, card: EnrichedCard, config: BoardConfig, now: Date): void {
  plan.cards.push(toCard(id, card, config, plan, plan.exercise));
  if (card.domainId === null) plan.domainFallback.push(id);
  plan.created++;
  plan.events.push({
    ...lifecycleEvent("imported", id, IMPORT_ACTOR, entryTs(card, now), { laneId: card.laneId }),
    toColumn: card.columnId,
  });
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
// stands; the export places the COLUMN only — never the canal of an
// existing card (ADR 058); a card a human moved to another column keeps it
// (divergence reported); a column the log's last word already gives (an
// import move the fold reads out of order, ADR 058) is not written again;
// else the export moves the card.
function refreshPosition(
  plan: LoadPlan, id: string, existing: CardState, card: EnrichedCard, reading: BoardReading, now: Date,
): void {
  if (!card.positioned) {
    plan.kept++;
    return;
  }
  if (existing.columnId === card.columnId) return;
  if (reading.movedByHand.has(id)) {
    plan.divergences.push({ title: card.title, fromColumn: existing.columnId, toColumn: card.columnId });
    return;
  }
  const last = reading.lastPosition.get(id);
  if (last !== undefined && last.actor === IMPORT_ACTOR && last.toColumn === card.columnId) return;
  plan.moved++;
  plan.events.push(movedEvent(
    id,
    { laneId: existing.laneId, columnId: existing.columnId },
    { laneId: existing.laneId, columnId: card.columnId },
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

function emptyPlan(year: number): LoadPlan {
  return {
    cards: [], events: [], created: 0, updated: 0, moved: 0, unlisted: 0, relisted: 0, kept: 0,
    divergences: [], chargesWithoutProfile: 0, factsKept: [], factsKeptCards: [], domainFallback: [],
    exercise: year, aliases: new Map(), deletedSkipped: [], adopted: [], identityDoubts: [],
    domainConflicts: [], domainReplaced: 0, domainKept: 0, domainUndecided: 0, domainKeptByPrior: 0,
  };
}

// The aging clock starts at the project start date (author, 2026-08-01) —
// never after the load (ADR 058): a « Début » still to come would date
// the event in the future, and the ts-ordered fold would replay it after
// every later move. No start date falls back to the run instant.
function entryTs(card: EnrichedCard, now: Date): string {
  const at = now.toISOString();
  if (card.createdAt === null) return at;
  const start = `${card.createdAt}T00:00:00.000Z`;
  return start < at ? start : at;
}
