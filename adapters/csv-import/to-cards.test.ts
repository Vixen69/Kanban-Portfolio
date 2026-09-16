// Checks of the load planner: first load, re-import upsert, the position
// conflict rule (a hand-moved card keeps its column, the divergence is
// reported), aging from the project start date.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig, Card, CardEvent } from "../../core/types.ts";
import { IMPORT_ACTOR, cardId, planLoad, withLegacyIds } from "./to-cards.ts";
import type { DomainDecision } from "../../core/import-types.ts";

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
    domainRule: "colonne « Domaine (Orga) »",
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
  assert.equal(plan.cards[0]?.id, "PE10001@2026", "one instance per exercise (ADR 035)");
  assert.equal(plan.cards[0]?.exercise, 2026);
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
  assert.equal(cardId(card({ codename: null, normalizedName: "etude connectivite site b" }), 2026),
    "IMP-etude-connectivite-site-b@2026");
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
    id: "evt-9", ts: "2026-07-20T10:00:00.000Z", actor: "pmo", cardId: "PE10001@2026",
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
  assert.deepEqual([unlisted?.cardId, unlisted?.actor], ["PE10002@2026", IMPORT_ACTOR]);
  const events2 = [...events, ...later.events.map((e, i) => ({ ...e, id: `evt-${events.length + i + 1}` }))];
  const again = planLoad([card()], CONFIG, stored, events2, new Date("2026-09-15T09:00:00.000Z"));
  assert.equal(again.unlisted, 0, "already marked: no second unlisted event");
  const back = planLoad([card(), second], CONFIG, stored, events2, new Date("2026-10-01T09:00:00.000Z"));
  assert.deepEqual([back.relisted, back.unlisted], [1, 0]);
  assert.equal(back.events.find((e) => e.type === "relisted")?.cardId, "PE10002@2026");
});

test("an export without position (no jalons) never moves an existing card: the board's position stands", () => {
  const before = stored("actifs");
  const plan = planLoad([card({ columnId: "demandes", positioned: false })], CONFIG, before.cards, before.events, NOW);
  assert.deepEqual([plan.updated, plan.moved, plan.kept, plan.events.length], [1, 0, 1, 0]);
  assert.equal(plan.cards[0]?.columnId, "demandes", "the snapshot still says what the export said");
});

// A board stored before ADR 035: bare ids, no exercise on the cards.
function legacyStored(columnId: string): { cards: Card[]; events: CardEvent[] } {
  const before = stored(columnId);
  const cards = before.cards.map((c) => { const { exercise: _e, ...rest } = c; return { ...rest, id: "PE10001" }; });
  return { cards, events: before.events.map((e) => ({ ...e, cardId: "PE10001" })) };
}

test("ADR 035: a card stored before (bare id) is refreshed in place, stamped, and the snapshot follows the alias", () => {
  const before = legacyStored("etudes");
  const plan = planLoad([card({ columnId: "actifs" })], CONFIG, before.cards, before.events, NOW, 2026);
  assert.deepEqual([plan.created, plan.updated, plan.moved], [0, 1, 1]);
  assert.equal(plan.cards[0]?.id, "PE10001", "the stored id stays: the log references it");
  assert.equal(plan.cards[0]?.exercise, 2026, "pinned on its exercise");
  assert.equal(plan.events[0]?.cardId, "PE10001");
  assert.deepEqual([...plan.aliases], [["PE10001@2026", "PE10001"]]);
  const snapshot = withLegacyIds({
    exerciseYear: 2026, persons: [],
    assignments: [{ personId: "p-1", cardId: "PE10001@2026", jh: 10, done: 2 }, { personId: "p-1", cardId: "PE10002@2026", jh: 1, done: 0 }],
    coutsDemand: [{ centre: "Architecte", cardId: "PE10001@2026", jh: 3, done: 0 }, { centre: "Architecte", cardId: null, jh: 1, done: 0 }],
  }, plan.aliases);
  assert.deepEqual(snapshot.assignments.map((a) => a.cardId), ["PE10001", "PE10002@2026"]);
  assert.deepEqual(snapshot.coutsDemand?.map((d) => d.cardId), ["PE10001", null]);
});

test("ADR 035: a load of 2027 creates that year's instances and never touches the 2026 cards", () => {
  const before = stored("etudes");
  const plan = planLoad([card({ columnId: "actifs" })], CONFIG, before.cards, before.events, NOW, 2027);
  assert.deepEqual([plan.exercise, plan.created, plan.updated, plan.moved, plan.unlisted], [2027, 1, 0, 0, 0]);
  assert.deepEqual([plan.cards[0]?.id, plan.cards[0]?.exercise, plan.cards[0]?.columnId], ["PE10001@2027", 2027, "actifs"]);
  assert.equal(plan.aliases.size, 0);
  // Both instances stored: an empty 2027 export marks only the 2027 card absent.
  const cards = [...before.cards, ...plan.cards];
  const events = [...before.events, ...plan.events.map((e, i) => ({ ...e, id: `evt-${before.events.length + i + 1}` }))];
  const absent = planLoad([], CONFIG, cards, events, new Date("2027-01-10T09:00:00.000Z"), 2027);
  assert.deepEqual(absent.events.map((e) => [e.type, e.cardId]), [["unlisted", "PE10001@2027"]]);
  assert.deepEqual(planLoad([], CONFIG, cards, events, NOW, 2026).events.map((e) => e.cardId), ["PE10001@2026"]);
});

// ADR 036: the domain is what the responsables de domaine arbitrate on —
// the export never overwrites it silently on a stored card.
test("ADR 036: a stored card's domain is a conflict, listed and undecided by default; each decision is traced", () => {
  const before = stored("actifs"); // the stored card sits in « infra »
  const deck = [card({ domainId: "ad", subDomainId: "forge_logiciels", domainRule: "dernier segment · « FORGE LOGICIELS »" })];
  const undecided = planLoad(deck, CONFIG, before.cards, before.events, NOW);
  assert.deepEqual([undecided.domainUndecided, undecided.domainConflicts.length, undecided.events.length], [1, 1, 0]);
  assert.deepEqual([undecided.cards[0]?.domain, undecided.cards[0]?.subDomain], ["infra", null], "the board's domain stands");
  assert.deepEqual(undecided.domainConflicts[0], {
    cardId: "PE10001@2026", title: "Modernisation atelier", codename: "PE10001",
    board: { domain: "infra", subDomain: null }, proposed: { domain: "ad", subDomain: "forge_logiciels" },
    rule: "dernier segment · « FORGE LOGICIELS »", prior: null, decision: null,
  });
  const decide = (decision: DomainDecision) =>
    planLoad(deck, CONFIG, before.cards, before.events, NOW, 2026, new Map([["PE10001@2026", decision]]));
  const replaced = decide("remplacer");
  assert.deepEqual([replaced.domainReplaced, replaced.cards[0]?.domain, replaced.cards[0]?.subDomain], [1, "ad", "forge_logiciels"]);
  const trace = replaced.events.find((e) => e.type === "edited");
  assert.deepEqual([trace?.actor, trace?.payload["decision"], trace?.payload["patch"]],
    [IMPORT_ACTOR, "remplacer", { domain: "ad", subDomain: "forge_logiciels" }]);
  const kept = decide("garder");
  assert.deepEqual([kept.domainKept, kept.cards[0]?.domain], [1, "infra"]);
  const keptEvent = kept.events.find((e) => e.type === "edited");
  assert.deepEqual(keptEvent?.payload["proposed"], { domain: "ad", subDomain: "forge_logiciels" });
  // With that « garder » in the log, the same proposal is not asked again; a new one is, flagged.
  const log: CardEvent[] = [...before.events, { ...keptEvent!, id: "evt-9" } as CardEvent];
  const silent = planLoad(deck, CONFIG, before.cards, log, NOW);
  assert.deepEqual([silent.domainConflicts.length, silent.domainKeptByPrior], [0, 1]);
  const fresh = planLoad([card({ domainId: "erp", domainRule: "dernier segment · « ERP »" })], CONFIG, before.cards, log, NOW);
  assert.deepEqual([fresh.domainConflicts.length, fresh.domainConflicts[0]?.prior?.kind], [1, "garder"]);
});

test("ADR 036: no conflict when the export resolved no domain — the board's value stands, not the first configured domain", () => {
  const before = stored("actifs");
  const blank = card({ domainId: null, subDomainId: null, domainRule: null });
  const plan = planLoad([blank], CONFIG, before.cards, before.events, NOW);
  assert.deepEqual([plan.domainConflicts.length, plan.cards[0]?.domain], [0, "infra"]);
  const fresh = planLoad([blank], CONFIG, [], [], NOW);
  assert.equal(fresh.cards[0]?.domain, CONFIG.domains[0]?.id, "a new card without domain takes the first configured one");
});
