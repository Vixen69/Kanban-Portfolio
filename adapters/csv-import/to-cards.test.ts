// Checks of the load planner: first load, re-import upsert, the position
// conflict rule (a hand-moved card keeps its column, the divergence is
// reported), aging from the project start date.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig, Card, CardEvent } from "../../core/types.ts";
import { IMPORT_ACTOR, cardId, planLoad } from "./to-cards.ts";
import type { EnrichedCard } from "./enrich.ts";

const CONFIG = JSON.parse(
  readFileSync(new URL("../../config/board.json", import.meta.url), "utf8"),
) as BoardConfig;

const NOW = new Date("2026-08-01T09:00:00.000Z");

function card(over: Partial<EnrichedCard> = {}): EnrichedCard {
  return {
    title: "Modernisation atelier",
    normalizedName: "modernisation atelier",
    codename: "PE10001",
    laneId: "projets",
    domainId: "infra",
    subDomainId: null,
    domainSource: "orga",
    owner: "Alice MERLE",
    typeId: "etude",
    columnId: "actifs",
    createdAt: "2025-01-12",
    dateRdr: "2026-09-15",
    budgetRdli: 150, budgetEstimated: 120.5, budgetConsumed: 80, budgetEngaged: 30,
    effortEstimated: 110, effortConsumed: 70,
    charges: [{ profileId: "pmo", jh: 40, done: 25 }],
    pdcKey: "modernisation atelier",
    positioned: true,
    ref: { file: "Projets.csv", line: 2 },
    ...over,
  };
}

test("first load: one card, one imported event aged at the project start", () => {
  const plan = planLoad([card()], CONFIG, [], [], NOW);
  assert.equal(plan.created, 1);
  assert.equal(plan.updated, 0);
  assert.equal(plan.cards[0]?.id, "PE10001");
  assert.equal(plan.cards[0]?.source, "csv");
  assert.equal(plan.cards[0]?.nature, "complicated");
  assert.equal(plan.cards[0]?.sciformaId, "PE10001");
  assert.deepEqual(plan.cards[0]?.chargeByProfile, [{ profileId: "pmo", jh: 40, done: 25 }]);
  const event = plan.events[0];
  assert.equal(event?.type, "imported");
  assert.equal(event?.toColumn, "actifs");
  assert.equal(event?.ts, "2025-01-12T00:00:00.000Z");
  assert.equal(event?.actor, IMPORT_ACTOR);
  assert.deepEqual(event?.payload, { laneId: "projets" });
});

test("a card without PE code gets a stable name-based id", () => {
  assert.equal(cardId(card({ codename: null, normalizedName: "etude connectivite site b" })),
    "IMP-etude-connectivite-site-b");
});

test("charges without a resolved profile are dropped and counted", () => {
  const plan = planLoad([card({ charges: [{ profileId: null, jh: 10, done: 2 }] })], CONFIG, [], [], NOW);
  assert.deepEqual(plan.cards[0]?.chargeByProfile, []);
  assert.equal(plan.chargesWithoutProfile, 1);
});

// One stored card in « etudes », imported once by this loader.
function stored(columnId: string): { cards: Card[]; events: CardEvent[] } {
  const plan = planLoad([card({ columnId })], CONFIG, [], [], NOW);
  const events: CardEvent[] = plan.events.map((input, index) => ({ ...input, id: `evt-${index + 1}` }));
  return { cards: plan.cards, events };
}

test("re-import: the card is updated, no second imported event", () => {
  const before = stored("actifs");
  const plan = planLoad([card({ budgetConsumed: 95 })], CONFIG, before.cards, before.events, NOW);
  assert.equal(plan.created, 0);
  assert.equal(plan.updated, 1);
  assert.equal(plan.moved, 0);
  assert.deepEqual(plan.events, []);
  assert.equal(plan.cards[0]?.budgetConsumed, 95);
});

test("re-import moves a card the export advanced, keeping its creation date", () => {
  const before = stored("etudes");
  const plan = planLoad([card({ columnId: "actifs" })], CONFIG, before.cards, before.events, NOW);
  assert.equal(plan.moved, 1);
  const event = plan.events[0];
  assert.equal(event?.type, "moved");
  assert.equal(event?.fromColumn, "etudes");
  assert.equal(event?.toColumn, "actifs");
  assert.equal(event?.actor, IMPORT_ACTOR);
  assert.equal(plan.cards[0]?.createdAt, before.cards[0]?.createdAt);
});

test("a hand-moved card keeps its column: the divergence is reported", () => {
  const before = stored("etudes");
  const byHand: CardEvent = {
    id: "evt-9", ts: "2026-07-20T10:00:00.000Z", actor: "pmo", cardId: "PE10001",
    type: "moved", fromColumn: "etudes", toColumn: "prets", payload: { laneId: "projets" },
  };
  const plan = planLoad([card({ columnId: "actifs" })], CONFIG, before.cards, [...before.events, byHand], NOW);
  assert.equal(plan.moved, 0);
  assert.deepEqual(plan.events, []);
  assert.deepEqual(plan.divergences, [
    { title: "Modernisation atelier", fromColumn: "prets", toColumn: "actifs" },
  ]);
});

test("re-import: a stored csv card missing from the export is marked absent, never deleted; relisted when back", () => {
  const second = card({ title: "Second sujet", normalizedName: "second sujet", codename: "PE10002" });
  const first = planLoad([card(), second], CONFIG, [], [], NOW);
  const stored = first.cards;
  const events = first.events.map((e, i) => ({ ...e, id: `evt-${i + 1}` }));
  const later = planLoad([card()], CONFIG, stored, events, new Date("2026-09-01T09:00:00.000Z"));
  assert.equal(later.unlisted, 1);
  assert.equal(later.cards.length, 1, "the absent card's snapshot is left as stored");
  const unlisted = later.events.find((e) => e.type === "unlisted");
  assert.deepEqual([unlisted?.cardId, unlisted?.actor], ["PE10002", IMPORT_ACTOR]);
  const events2 = [...events, ...later.events.map((e, i) => ({ ...e, id: `evt-${events.length + i + 1}` }))];
  const again = planLoad([card()], CONFIG, stored, events2, new Date("2026-09-15T09:00:00.000Z"));
  assert.equal(again.unlisted, 0, "already marked: no second unlisted event");
  const back = planLoad([card(), second], CONFIG, stored, events2, new Date("2026-10-01T09:00:00.000Z"));
  assert.deepEqual([back.relisted, back.unlisted], [1, 0]);
  assert.equal(back.events.find((e) => e.type === "relisted")?.cardId, "PE10002");
});
