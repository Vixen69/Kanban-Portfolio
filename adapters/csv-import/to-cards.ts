// Turning the audited deck into board cards and their events (the real
// load, 2026-08-01 decisions): cards age from the project start date
// (« Début »); a re-import updates the existing cards and adds the new
// ones. Conflict rule: the export wins on FACTS (budgets, charge, domain,
// owner, dates, type — Sciforma truths), the board wins on POSITION as
// soon as a human moved the card there (the arbitration is the PMO's), the
// divergence being reported instead of overwritten.
// Pure: no storage, no clock of its own — the caller passes both.

import type { BoardConfig, Card, CardEvent, ChargeEntry } from "../../core/types.ts";
import type { CardEventInput } from "../../core/events.ts";
import { lifecycleEvent, movedEvent } from "../../core/events.ts";
import { laneNature } from "../../core/config.ts";
import { foldEvents } from "../../core/state.ts";
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
  /** Cards the export would move but a human already placed by hand. */
  divergences: Array<{ title: string; fromColumn: string; toColumn: string }>;
  /** Charges dropped because their métier stayed unresolved. */
  chargesWithoutProfile: number;
}

/**
 * Builds the load plan from the audited deck and the current board state.
 * Inputs: the enriched cards, the board config, the cards and events
 * already stored (empty arrays on a first load), and `now` (injected).
 * Outputs: the LoadPlan — nothing is written here.
 * Failure modes: none; cards whose identity cannot be derived keep a
 * name-based id, so a renamed project creates a new card (the code
 * cross-check of the audit flags that case beforehand).
 */
export function planLoad(
  deck: EnrichedCard[], config: BoardConfig,
  existingCards: Card[], existingEvents: CardEvent[], now: Date,
): LoadPlan {
  const current = new Map(foldEvents(existingCards, existingEvents).map((c) => [c.id, c]));
  const movedByHand = handMovedIds(existingEvents);
  const plan: LoadPlan = {
    cards: [], events: [], created: 0, updated: 0, moved: 0,
    divergences: [], chargesWithoutProfile: 0,
  };
  for (const card of deck) {
    const id = cardId(card);
    const existing = current.get(id);
    plan.cards.push(toCard(id, card, config, plan, existing?.createdAt));
    if (existing === undefined) {
      plan.created++;
      plan.events.push({
        ...lifecycleEvent("imported", id, IMPORT_ACTOR, entryTs(card, now), { laneId: card.laneId }),
        toColumn: card.columnId,
      });
      continue;
    }
    plan.updated++;
    if (existing.columnId === card.columnId && existing.laneId === card.laneId) continue;
    if (movedByHand.has(id)) {
      plan.divergences.push({
        title: card.title, fromColumn: existing.columnId, toColumn: card.columnId,
      });
      continue;
    }
    plan.moved++;
    plan.events.push(movedEvent(
      id,
      { laneId: existing.laneId, columnId: existing.columnId },
      { laneId: card.laneId, columnId: card.columnId },
      IMPORT_ACTOR, now.toISOString(),
    ));
  }
  return plan;
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
 * Stable board id of an imported card: its PE code when it has one, else a
 * slug of its normalized name — so a re-import lands on the same card.
 * Inputs: the enriched card. Outputs: the id. Failure modes: none.
 */
export function cardId(card: EnrichedCard): string {
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
  id: string, card: EnrichedCard, config: BoardConfig, plan: LoadPlan, keepCreatedAt?: string,
): Card {
  const charges = card.charges.flatMap((charge): ChargeEntry[] => {
    if (charge.profileId === null) {
      plan.chargesWithoutProfile++;
      return [];
    }
    return [{ profileId: charge.profileId, jh: charge.jh, done: charge.done }];
  });
  return {
    id,
    title: card.title,
    domain: card.domainId ?? config.domains[0]?.id ?? "",
    laneId: card.laneId,
    columnId: card.columnId,
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
    chargeByProfile: charges,
    contentionProfiles: [], contentionNote: "",
    risks: [], projectConstraints: [], alerts: [],
    dateRdr: card.dateRdr,
    sciformaId: card.codename,
    custom: {},
    createdAt: keepCreatedAt ?? `${card.createdAt ?? new Date(0).toISOString().slice(0, 10)}T00:00:00.000Z`,
    source: "csv",
  };
}
