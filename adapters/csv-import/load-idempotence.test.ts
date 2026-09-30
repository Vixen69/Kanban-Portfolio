// ADR 058 — the load reads the board the way the fold does and writes
// nothing twice: reorders and canal-only moves never pin a card, restores
// are read through, a card deleted on the board is skipped, an « imported »
// event is never dated after the load, and an import move the log already
// holds is not written again.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig, Card, CardEvent } from "../../core/types.ts";
import type { CardEventInput } from "../../core/events.ts";
import { lifecycleEvent, movedEvent } from "../../core/events.ts";
import { foldEvents } from "../../core/state.ts";
import { IMPORT_ACTOR, planLoad } from "./to-cards.ts";
import type { LoadPlan } from "./to-cards.ts";
import type { EnrichedCard } from "./enrich.ts";

const CONFIG = JSON.parse(readFileSync(new URL("../../config/board.json", import.meta.url), "utf8")) as BoardConfig;
const NOW = new Date("2026-09-30T09:00:00.000Z");
const LATER = new Date("2026-10-15T09:00:00.000Z");
const ID = "PE10001@2026";

function card(over: Partial<EnrichedCard> = {}): EnrichedCard {
  return {
    title: "Modernisation atelier", normalizedName: "modernisation atelier", codename: "PE10001",
    laneId: "projets", domainId: "infra", subDomainId: null, domainSource: "orga", domainRule: null,
    owner: "Alice MERLE", typeId: "etude", columnId: "etudes", createdAt: "2025-01-12", dateRdr: null,
    budgetRdli: null, budgetEstimated: 10, budgetConsumed: null, budgetEngaged: null,
    effortEstimated: null, effortConsumed: null, charges: [], pdcKey: null, positioned: true,
    ref: { file: "Projets.csv", line: 2 },
    ...over,
  };
}

// A store in miniature: base cards by id, the log with its sequence.
class Board {
  cards: Card[] = [];
  events: CardEvent[] = [];
  write(plan: LoadPlan): LoadPlan {
    const byId = new Map(this.cards.map((c) => [c.id, c]));
    for (const c of plan.cards) byId.set(c.id, c);
    this.cards = [...byId.values()];
    for (const input of plan.events) this.append(input);
    return plan;
  }
  append(input: CardEventInput): CardEvent {
    const event = { ...input, id: `evt-${this.events.length + 1}` } as CardEvent;
    this.events.push(event);
    return event;
  }
  load(deck: EnrichedCard[], now = NOW): LoadPlan {
    return this.write(planLoad(deck, CONFIG, this.cards, this.events, now));
  }
  column(id: string): string | undefined {
    return foldEvents(this.cards, this.events).find((c) => c.id === id)?.columnId;
  }
  restoreTo(seq: number): void {
    this.append(lifecycleEvent("restored", "*", "pmo", NOW.toISOString(), { toSeq: seq }));
  }
}

const hand = (from: string, to: string, fromLane = "projets", toLane = fromLane, beforeId?: string): CardEventInput =>
  movedEvent(ID, { laneId: fromLane, columnId: from }, { laneId: toLane, columnId: to }, "pmo", NOW.toISOString(), beforeId);

test("a same-cell reorder never pins a card: the export still moves it", () => {
  const board = new Board();
  board.load([card()]);
  board.append(hand("etudes", "etudes", "projets", "projets", "PE10002@2026"));
  const plan = board.load([card({ columnId: "actifs" })]);
  assert.deepEqual([plan.moved, plan.divergences.length], [1, 0]);
  assert.equal(board.column(ID), "actifs");
});

test("a canal-only move never pins a card, is no divergence, and the export keeps the card's canal", () => {
  const board = new Board();
  board.load([card()]);
  board.append(hand("etudes", "etudes", "projets", "projets_complexes"));
  const same = board.load([card()]);
  assert.deepEqual([same.divergences, same.events], [[], []], "identical files: nothing to say, nothing written");
  const plan = board.load([card({ columnId: "actifs" })]);
  assert.equal(plan.moved, 1);
  assert.equal(plan.events[0]?.payload["laneId"], "projets_complexes", "the export never places the canal");
  assert.equal(foldEvents(board.cards, board.events)[0]?.laneId, "projets_complexes");
});

test("a real hand move to another column still keeps it: divergence reported", () => {
  const board = new Board();
  board.load([card()]);
  board.append(hand("etudes", "prets"));
  const plan = board.load([card({ columnId: "actifs" })]);
  assert.deepEqual([plan.moved, plan.divergences.length, board.column(ID)], [0, 1, "prets"]);
});

test("a hand move a restore undid does not pin the card (ADR 042)", () => {
  const board = new Board();
  board.load([card()]);
  const at = board.events.length;
  board.append(hand("etudes", "prets"));
  board.restoreTo(at);
  const plan = board.load([card({ columnId: "actifs" })]);
  assert.deepEqual([plan.moved, plan.divergences.length, board.column(ID)], [1, 0, "actifs"]);
});

test("a « garder » a restore undid no longer silences the domain question", () => {
  const board = new Board();
  board.load([card()]);
  const at = board.events.length;
  const deck = [card({ domainId: "erp" })];
  board.write(planLoad(deck, CONFIG, board.cards, board.events, NOW, 2026, new Map([[ID, "garder"]])));
  assert.equal(planLoad(deck, CONFIG, board.cards, board.events, NOW).domainConflicts.length, 0, "kept: not asked again");
  board.restoreTo(at);
  const again = planLoad(deck, CONFIG, board.cards, board.events, NOW);
  assert.deepEqual([again.domainConflicts.length, again.domainKeptByPrior], [1, 0]);
});

test("a card deleted on the board is skipped: not re-created, no event, named — and a restore brings it back to the load", () => {
  const board = new Board();
  board.load([card(), card({ codename: "PE10002", title: "Second", normalizedName: "second" })]);
  const at = board.events.length;
  board.append(lifecycleEvent("deleted", ID, "pmo", NOW.toISOString()));
  const plan = board.load([card(), card({ codename: "PE10002", title: "Second", normalizedName: "second" })]);
  assert.deepEqual([plan.created, plan.updated, plan.unlisted, plan.deletedSkipped], [0, 1, 0, [ID]]);
  assert.equal(plan.events.length, 0);
  assert.equal(plan.cards.some((c) => c.id === ID), false, "its snapshot is not rewritten");
  board.restoreTo(at);
  const back = board.load([card({ budgetEstimated: 12 })]);
  assert.deepEqual([back.deletedSkipped, back.updated], [[], 1]);
});

test("a deleted card stored before ADR 035 (bare id) is not re-created as « code@année »", () => {
  const board = new Board();
  board.load([card()]);
  board.cards = board.cards.map((c) => { const { exercise: _e, ...rest } = c; return { ...rest, id: "PE10001" }; });
  board.events = board.events.map((e) => ({ ...e, cardId: "PE10001" }));
  board.append(lifecycleEvent("deleted", "PE10001", "pmo", NOW.toISOString()));
  const plan = board.load([card()]);
  assert.deepEqual([plan.created, plan.deletedSkipped.length, plan.events.length], [0, 1, 0]);
});

test("a « Début » still to come dates the imported event at the load, later moves stand, a re-import writes nothing", () => {
  const board = new Board();
  const first = board.load([card({ createdAt: "2027-03-10", columnId: "demandes" })]);
  assert.equal(first.events[0]?.ts, NOW.toISOString());
  assert.equal(first.cards[0]?.createdAt, "2027-03-10T00:00:00.000Z", "the card keeps its real start day");
  const advanced = [card({ createdAt: "2027-03-10", columnId: "etudes" })];
  assert.equal(board.load(advanced, LATER).moved, 1);
  assert.equal(board.column(ID), "etudes");
  assert.equal(board.load(advanced, LATER).events.length, 0, "the same files write nothing more");
});

test("a future-dated imported event already in the log: the import move is not written again at each load", () => {
  const board = new Board();
  board.load([card({ columnId: "demandes" })]);
  board.events = board.events.map((e) => (e.type === "imported" ? { ...e, ts: "2027-03-10T00:00:00.000Z" } : e));
  const advanced = [card({ columnId: "etudes" })];
  assert.equal(board.load(advanced).moved, 1);
  const again = board.load(advanced);
  assert.deepEqual([again.moved, again.events.length], [0, 0], "the log already says it");
  assert.equal(board.events.filter((e) => e.actor === IMPORT_ACTOR && e.type === "moved").length, 1);
});

test("two deck cards on one id: the second is left out and said", () => {
  const plan = planLoad([card(), card({ title: "Autre projet", normalizedName: "autre projet" })], CONFIG, [], [], NOW);
  assert.deepEqual([plan.created, plan.cards.length], [1, 1]);
  assert.match(plan.identityDoubts[0] ?? "", /PE10001@2026.*Modernisation atelier.*Autre projet/);
});
