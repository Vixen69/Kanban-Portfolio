// ADR 059 — a hand-made card whose code the export carries is ADOPTED by
// the load: its id kept (aliased for the capacity snapshot), its base card
// becomes the import's, its hand edits still read on top; two hand-made
// cards on one code are a question, never an adoption. What the export
// never carries (criticality, notes, resources...) stays the hand card's.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig, Card, CardEvent, Risk } from "../../core/types.ts";
import { lifecycleEvent } from "../../core/events.ts";
import { foldEvents } from "../../core/state.ts";
import { testCard } from "../../core/test-helpers.ts";
import { planLoad, withLegacyIds } from "./to-cards.ts";
import type { EnrichedCard } from "./enrich.ts";

const CONFIG = JSON.parse(readFileSync(new URL("../../config/board.json", import.meta.url), "utf8")) as BoardConfig;
const NOW = new Date("2026-09-30T09:00:00.000Z");

function deckCard(over: Partial<EnrichedCard> = {}): EnrichedCard {
  return {
    title: "Modernisation atelier", normalizedName: "modernisation atelier", codename: "PE10001",
    laneId: "projets", domainId: "infra", subDomainId: null, domainSource: "orga", domainRule: null,
    owner: "Alice MERLE", typeId: "etude", columnId: "etudes", createdAt: "2025-01-12", dateRdr: null,
    budgetRdli: 150, budgetEstimated: 120.5, budgetConsumed: null, budgetEngaged: null,
    effortEstimated: null, effortConsumed: null, charges: [], pdcKey: null, positioned: true,
    ref: { file: "Cout.csv", line: 2 },
    ...over,
  };
}

// A card created by hand in the fiche (ADR 057): source manual, its code typed.
function manual(over: Partial<Card> = {}): Card {
  return testCard({
    id: "S001", title: "Atelier (saisi à la main)", codename: "pe10001 ", source: "manual", domain: "infra",
    laneId: "projets", columnId: "demandes", typeId: "etude", createdAt: "2026-09-01T08:00:00.000Z",
    budgetEstimated: 90, notes: "saisi en séance", ...over,
  });
}

function created(card: Card, seq: number): CardEvent {
  return { ...lifecycleEvent("created", card.id, "pmo", card.createdAt), toColumn: card.columnId, id: `evt-${seq}` } as CardEvent;
}

test("a hand-made card carrying the export's code is adopted: id kept, base card the import's, hand edits on top", () => {
  const hand = manual();
  const edit = { ...lifecycleEvent("edited", "S001", "pmo", "2026-09-10T08:00:00.000Z", { patch: { notes: "revu en RSP" } }), id: "evt-2" } as CardEvent;
  const events = [created(hand, 1), edit];
  const plan = planLoad([deckCard()], CONFIG, [hand], events, NOW);
  assert.deepEqual([plan.created, plan.updated, plan.cards.length], [0, 1, 1]);
  const base = plan.cards[0]!;
  assert.deepEqual([base.id, base.source, base.sciformaId, base.codename], ["S001", "csv", "PE10001", "PE10001"]);
  assert.equal(base.createdAt, hand.createdAt, "the card's creation instant is kept");
  assert.equal(base.budgetEstimated, 120.5, "the export's facts");
  assert.equal(base.exercise, 2026);
  assert.deepEqual(plan.adopted, [{ id: "S001", code: "PE10001", title: "Modernisation atelier", manualTitle: "Atelier (saisi à la main)" }]);
  assert.deepEqual([...plan.aliases], [["PE10001@2026", "S001"]]);
  assert.equal(plan.moved, 1, "never moved by hand: the export places it");
  const board = foldEvents(plan.cards, [...events, ...plan.events.map((e, i) => ({ ...e, id: `evt-${3 + i}` }) as CardEvent)]);
  assert.deepEqual([board[0]?.notes, board[0]?.columnId], ["revu en RSP", "etudes"], "the hand edit still reads on top");
  const capacity = withLegacyIds({ exerciseYear: 2026, persons: [], assignments: [{ personId: "p", cardId: "PE10001@2026", jh: 3, done: 0 }] }, plan.aliases);
  assert.equal(capacity.assignments[0]?.cardId, "S001", "the capacity snapshot follows");
});

test("an adopted card is found again by the next load: no duplicate, nothing adopted twice", () => {
  const hand = manual();
  const first = planLoad([deckCard()], CONFIG, [hand], [created(hand, 1)], NOW);
  const log = [created(hand, 1), ...first.events.map((e, i) => ({ ...e, id: `evt-${2 + i}` }) as CardEvent)];
  const again = planLoad([deckCard()], CONFIG, first.cards, log, NOW);
  assert.deepEqual([again.created, again.updated, again.adopted.length, again.events.length], [0, 1, 0, 0]);
  assert.deepEqual([...again.aliases], [["PE10001@2026", "S001"]]);
});

test("two hand-made cards on one code: none adopted, the question is said, the export's card is created apart", () => {
  const cards = [manual(), manual({ id: "S002", codename: "PE10001" })];
  const plan = planLoad([deckCard()], CONFIG, cards, [created(cards[0]!, 1), created(cards[1]!, 2)], NOW);
  assert.deepEqual([plan.created, plan.adopted.length, plan.cards[0]?.id], [1, 0, "PE10001@2026"]);
  assert.match(plan.identityDoubts[0] ?? "", /PE10001.*2 cartes créées à la main \(S001, S002\)/);
});

test("no adoption of an archived, a deleted or another exercise's hand-made card, nor when the instance exists", () => {
  const archived = planLoad([deckCard()], CONFIG, [manual()], [
    created(manual(), 1), { ...lifecycleEvent("archived", "S001", "pmo", NOW.toISOString()), id: "evt-2" } as CardEvent,
  ], NOW);
  assert.deepEqual([archived.adopted.length, archived.created], [0, 1]);
  const deleted = planLoad([deckCard()], CONFIG, [manual()], [
    created(manual(), 1), { ...lifecycleEvent("deleted", "S001", "pmo", NOW.toISOString()), id: "evt-2" } as CardEvent,
  ], NOW);
  assert.deepEqual([deleted.adopted.length, deleted.created, deleted.deletedSkipped.length], [0, 1, 0], "a deleted hand card never blocks the export");
  const other = planLoad([deckCard()], CONFIG, [manual({ exercise: 2027 })], [created(manual(), 1)], NOW);
  assert.deepEqual([other.adopted.length, other.created], [0, 1]);
  const first = planLoad([deckCard()], CONFIG, [], [], NOW);
  const log = first.events.map((e, i) => ({ ...e, id: `evt-${i + 1}` }) as CardEvent);
  const both = planLoad([deckCard()], CONFIG, [...first.cards, manual()], [...log, created(manual(), 9)], NOW);
  assert.deepEqual([both.adopted.length, both.updated, both.cards[0]?.id], [0, 1, "PE10001@2026"]);
});

test("adoption keeps what was typed at the hand card's creation — in its BASE card, no event behind it (ADR 057)", () => {
  const risk: Risk = { type: "fournisseur", desc: "fournisseur unique" };
  const hand = manual({
    criticality: "top", resources: ["Bob"], loadPlan: "PdC v2", tags: ["x"], risks: [risk], alerts: ["à revoir"],
    projectConstraints: ["c1"], contentionProfiles: ["archi"], contentionNote: "partagé", custom: { f: 1 },
  });
  const plan = planLoad([deckCard()], CONFIG, [hand], [created(hand, 1)], NOW);
  assert.equal(plan.adopted.length, 1);
  const board = foldEvents(plan.cards, [created(hand, 1), ...plan.events.map((e, i) => ({ ...e, id: `evt-${2 + i}` }) as CardEvent)]);
  const card = board[0]!;
  assert.deepEqual(
    [card.criticality, card.notes, card.resources, card.loadPlan, card.tags, card.risks, card.alerts,
      card.projectConstraints, card.contentionProfiles, card.contentionNote, card.custom],
    ["top", "saisi en séance", ["Bob"], "PdC v2", ["x"], [risk], ["à revoir"], ["c1"], ["archi"], "partagé", { f: 1 }],
  );
  assert.deepEqual([card.title, card.budgetEstimated, card.source], ["Modernisation atelier", 120.5, "csv"], "the export's facts still win");
  const again = planLoad([deckCard()], CONFIG, plan.cards, [created(hand, 1), ...plan.events.map((e, i) => ({ ...e, id: `evt-${2 + i}` }) as CardEvent)], NOW);
  assert.deepEqual([again.events.length, again.cards[0]?.criticality], [0, "top"], "idempotent: the next load writes nothing");
});
