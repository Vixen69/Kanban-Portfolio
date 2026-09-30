// ADR 061 fill, the Historique (author, 2026-09-30): when the import gives
// a domain to a card that had none, the load writes ONE `edited` event of
// the import actor (patch, previous, reason « export », no decision) so
// that the fiche says « Domaine donné par l’export : Sans domaine →
// INFRA »; the report names the card with the same words. That event is
// no human decision: the ADR 036 reading of the log skips it (no
// « modifié à la main » on a later conflict, the ADR 061 « à vérifier »
// still possible). A second load writes nothing more; older logs read as
// before.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig, Card, CardEvent } from "../../core/types.ts";
import { foldEvents } from "../../core/state.ts";
import { cardHistory } from "../../core/history.ts";
import { IMPORT_ACTOR, planLoad } from "./to-cards.ts";
import { priorDomainDecisions } from "./domain-conflicts.ts";
import { importChanges } from "./import-changes.ts";
import { runImportAudit } from "./orchestrate.ts";
import type { EnrichedCard } from "./enrich.ts";

const CONFIG = JSON.parse(readFileSync(new URL("../../config/board.json", import.meta.url), "utf8")) as BoardConfig;
const NOW = new Date("2026-09-08T09:00:00.000Z");
const LATER = new Date("2026-09-09T09:00:00.000Z");
const ID = "PE10001@2026";
const nameOf = (id: string): string => CONFIG.domains.find((d) => d.id === id)?.name ?? "?";

function deckCard(over: Partial<EnrichedCard> = {}): EnrichedCard {
  return {
    title: "Modernisation atelier", normalizedName: "modernisation atelier", codename: "PE10001",
    laneId: "projets", domainId: "infra", subDomainId: null, domainSource: "orga", domainRule: "colonne « Domaine (Orga) »",
    owner: null, typeId: "etude", columnId: "actifs", createdAt: "2025-01-12", dateRdr: null,
    budgetRdli: null, budgetEstimated: null, budgetConsumed: null, budgetEngaged: null,
    effortEstimated: null, effortConsumed: null, charges: [], pdcKey: "modernisation atelier",
    positioned: true, ref: { file: "Projets.csv", line: 2 },
    ...over,
  };
}

const BLANK = { domainId: null, subDomainId: null, domainSource: null, domainRule: null } as const;

interface Board { cards: Card[]; events: CardEvent[] }

function apply(board: Board, plan: ReturnType<typeof planLoad>): void {
  const byId = new Map(board.cards.map((card) => [card.id, card]));
  for (const card of plan.cards) byId.set(card.id, card);
  board.cards = [...byId.values()];
  board.events = [...board.events, ...plan.events.map((event, i) => ({ ...event, id: `evt-${board.events.length + i + 1}` }))];
}

// A board holding the card without domain (entered when the export resolved none).
function boardWithoutDomain(): Board {
  const board: Board = { cards: [], events: [] };
  apply(board, planLoad([deckCard(BLANK)], CONFIG, [], [], NOW));
  return board;
}

test("the fill writes one edited event of the import: patch, previous, reason « export », no decision", () => {
  const board = boardWithoutDomain();
  const plan = planLoad([deckCard()], CONFIG, board.cards, board.events, LATER);
  const fills = plan.events.filter((e) => e.type === "edited");
  assert.deepEqual(fills.map((e) => [e.cardId, e.actor, e.ts, e.payload]), [[ID, IMPORT_ACTOR, LATER.toISOString(), {
    patch: { domain: "infra", subDomain: null }, previous: { domain: "", subDomain: null }, reason: "export",
  }]]);
  apply(board, plan);
  assert.equal(foldEvents(board.cards, board.events)[0]?.domain, "infra", "the fold agrees with the base card");
  assert.deepEqual(planLoad([deckCard()], CONFIG, board.cards, board.events, LATER).events.filter((e) => e.type === "edited"), [], "a second load writes nothing more");
});

test("the fiche's Historique says « Domaine donné par l’export : Sans domaine → INFRA »", () => {
  const board = boardWithoutDomain();
  apply(board, planLoad([deckCard()], CONFIG, board.cards, board.events, LATER));
  const line = cardHistory(board.events, ID, CONFIG).find((entry) => entry.kind === "domain");
  assert.deepEqual([line?.detail, line?.actor], [`Domaine donné par l’export : Sans domaine → ${nameOf("infra")}`, IMPORT_ACTOR]);
});

test("the fill is no human decision: no prior, still « à vérifier » when the export drops it, no « main » on a later conflict", () => {
  const board = boardWithoutDomain();
  apply(board, planLoad([deckCard({ domainId: "ad" })], CONFIG, board.cards, board.events, LATER));
  assert.deepEqual([...priorDomainDecisions(board.events).keys()], [], "the ADR 036 reading skips it");
  const blank = planLoad([deckCard(BLANK)], CONFIG, board.cards, board.events, LATER);
  assert.deepEqual(blank.domainToCheck, [ID], "the first domain, never confirmed by hand: « à vérifier » (ADR 061)");
  const conflict = planLoad([deckCard({ domainId: "infra" })], CONFIG, board.cards, board.events, LATER);
  assert.deepEqual(conflict.domainConflicts.map((c) => [c.cardId, c.prior]), [[ID, null]], "a conflict, with no hand decision behind it");
});

test("a legacy log (no fill event) reads as before, and a hand domain still counts as one", () => {
  const board = boardWithoutDomain();
  board.cards = board.cards.map((card) => ({ ...card, domain: "infra" }));
  board.events.push({ id: "evt-9", ts: LATER.toISOString(), actor: "anonymous", cardId: ID, type: "edited", fromColumn: null, toColumn: null, payload: { patch: { domain: "infra" } } });
  assert.deepEqual([...priorDomainDecisions(board.events).values()].map((p) => p.kind), ["main"]);
  assert.deepEqual(planLoad([deckCard()], CONFIG, board.cards, board.events, LATER).events.filter((e) => e.type === "edited"), [], "nothing to fill");
});

test("the readable report names the card with the Historique's words", () => {
  const board = boardWithoutDomain();
  const audit = runImportAudit([], CONFIG, LATER);
  const plan = planLoad([deckCard()], CONFIG, board.cards, board.events, LATER);
  const report = importChanges({ audit, config: CONFIG, year: 2026, plan, baseCards: board.cards, events: board.events });
  assert.deepEqual(report.domainFilled?.map((c) => [c.cardId, c.reason]), [[ID, `Domaine donné par l’export : Sans domaine → ${nameOf("infra")}`]]);
  const none = importChanges({ audit, config: CONFIG, year: 2026, plan: null, baseCards: [], events: [] });
  assert.deepEqual(none.domainFilled, []);
});
