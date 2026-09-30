// ADR 060 — the export's NEW information wins; a repeat of the previous
// import's information leaves the hand's work alone. Facts: a hand
// correction stands while the export repeats the old value, and is taken
// back (one `edited` event of the import actor) when the export brings a
// new one. Positions: a hand placement stands against a repeated or a
// backward jalon, and is passed by a jalon new since the previous import
// and further along the flow; an adopted hand-made card is placed by its
// jalons; a load without position keeps the previous import's column.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig, Card, CardEvent, CardPatch } from "../../core/types.ts";
import type { CardEventInput } from "../../core/events.ts";
import { lifecycleEvent, movedEvent } from "../../core/events.ts";
import { foldEvents } from "../../core/state.ts";
import { testCard } from "../../core/test-helpers.ts";
import { IMPORT_ACTOR, planLoad } from "./to-cards.ts";
import type { LoadPlan } from "./to-cards.ts";
import type { EnrichedCard } from "./enrich.ts";

const CONFIG = JSON.parse(readFileSync(new URL("../../config/board.json", import.meta.url), "utf8")) as BoardConfig;
const NOW = new Date("2026-09-30T09:00:00.000Z");
const HAND_TS = "2026-09-20T09:00:00.000Z";
const ID = "PE10001@2026";

function deck(over: Partial<EnrichedCard> = {}): EnrichedCard {
  return {
    title: "Modernisation atelier", normalizedName: "modernisation atelier", codename: "PE10001",
    laneId: "projets", domainId: "infra", subDomainId: null, domainSource: "orga", domainRule: null,
    owner: "Alice MERLE", typeId: "etude", columnId: "etudes", createdAt: "2025-01-12", dateRdr: "2026-11-15",
    budgetRdli: 150, budgetEstimated: 120, budgetConsumed: 40, budgetEngaged: 30,
    effortEstimated: 100, effortConsumed: 20, charges: [{ profileId: "pmo", jh: 40, done: 10 }], pdcKey: null,
    positioned: true, ref: { file: "Projets.csv", line: 2 },
    ...over,
  };
}

// A store in miniature: base cards by id, the log with its sequence.
class Board {
  cards: Card[] = [];
  events: CardEvent[] = [];
  append(input: CardEventInput): void {
    this.events.push({ ...input, id: `evt-${this.events.length + 1}` } as CardEvent);
  }
  load(cards: EnrichedCard[], now = NOW): LoadPlan {
    const plan = planLoad(cards, CONFIG, this.cards, this.events, now);
    const byId = new Map(this.cards.map((c) => [c.id, c]));
    for (const c of plan.cards) byId.set(c.id, c);
    this.cards = [...byId.values()];
    for (const input of plan.events) this.append(input);
    return plan;
  }
  edit(patch: CardPatch, id = ID): void {
    this.append(lifecycleEvent("edited", id, "pmo", HAND_TS, { patch }));
  }
  move(from: string, to: string, id = ID): void {
    this.append(movedEvent(id, { laneId: "projets", columnId: from }, { laneId: "projets", columnId: to }, "pmo", HAND_TS));
  }
  card(id = ID): Card | undefined {
    return foldEvents(this.cards, this.events).find((c) => c.id === id);
  }
}

// Facts: hand edit, then the reload's value — what the board shows, and
// whether the import wrote its `edited` event.
const FACT_CASES: Array<{ name: string; hand: CardPatch; reload: Partial<EnrichedCard>; shows: Partial<Card>; written: string[] }> = [
  { name: "the export repeats the value: the hand correction stands, nothing written", hand: { budgetEstimated: 150 }, reload: {}, shows: { budgetEstimated: 150 }, written: [] },
  { name: "a new value: it takes the hand correction back", hand: { budgetEstimated: 150 }, reload: { budgetEstimated: 180 }, shows: { budgetEstimated: 180 }, written: ["estimé k€"] },
  { name: "a new value equal to the hand's: nothing to write", hand: { budgetEstimated: 150 }, reload: { budgetEstimated: 150 }, shows: { budgetEstimated: 150 }, written: [] },
  { name: "a blank in the files is no new value (ADR 054): the hand stands", hand: { budgetEstimated: 150 }, reload: { budgetEstimated: null }, shows: { budgetEstimated: 150 }, written: [] },
  { name: "zero is a new value", hand: { budgetConsumed: 55 }, reload: { budgetConsumed: 0 }, shows: { budgetConsumed: 0 }, written: ["réalisé k€"] },
  { name: "a new chef de projet replaces the hand's", hand: { owner: "Carl NOYER" }, reload: { owner: "Bruno DIAZ" }, shows: { owner: "Bruno DIAZ" }, written: ["chef de projet"] },
  { name: "a new RDR date replaces the hand's", hand: { dateRdr: "2026-12-01" }, reload: { dateRdr: "2027-01-15" }, shows: { dateRdr: "2027-01-15" }, written: ["date RDR"] },
  {
    name: "an older full-timestamp hand RDR and a new export on the same day: nothing to write",
    hand: { dateRdr: "2026-12-15T00:00:00.000Z" }, reload: { dateRdr: "2026-12-15" }, shows: { dateRdr: "2026-12-15T00:00:00.000Z" }, written: [],
  },
  {
    name: "an older full-timestamp hand RDR and a new export on another day: replaced",
    hand: { dateRdr: "2026-12-15T00:00:00.000Z" }, reload: { dateRdr: "2027-01-15" }, shows: { dateRdr: "2027-01-15" }, written: ["date RDR"],
  },
  {
    name: "a new plan de charge replaces the hand's per-métier edit whole",
    hand: { chargeByProfile: [{ profileId: "pmo", jh: 40, done: 30 }] }, reload: { charges: [{ profileId: "pmo", jh: 60, done: 10 }] },
    shows: { chargeByProfile: [{ profileId: "pmo", jh: 60, done: 10 }] }, written: ["plan de charge par métier"],
  },
  { name: "the title is not taken back: a retitle is the PMO's label", hand: { title: "Atelier (RSP)" }, reload: { title: "Atelier modernisé" }, shows: { title: "Atelier (RSP)" }, written: [] },
  { name: "a new value, no hand edit on that fact: the base refresh suffices", hand: { notes: "vu en RSP" }, reload: { budgetEstimated: 180 }, shows: { budgetEstimated: 180, notes: "vu en RSP" }, written: [] },
];

for (const c of FACT_CASES) {
  test(`ADR 060 facts: ${c.name}`, () => {
    const board = new Board();
    board.load([deck()]);
    board.edit(c.hand);
    const plan = board.load([deck(c.reload)]);
    const written = plan.events.filter((e) => e.type === "edited");
    assert.deepEqual(plan.replaced.map((r) => r.label), c.written);
    assert.equal(written.length, c.written.length === 0 ? 0 : 1, "one event per card at most");
    for (const event of written) assert.deepEqual([event.actor, event.cardId, event.ts, event.payload["reason"]], [IMPORT_ACTOR, ID, NOW.toISOString(), "export"]);
    for (const [fact, value] of Object.entries(c.shows)) assert.deepEqual(board.card()?.[fact as keyof Card], value, fact);
    assert.deepEqual(board.load([deck(c.reload)]).events, [], "reloading the same files writes nothing (ADR 058)");
  });
}

test("ADR 060 facts: once taken back, a later hand correction stands again while the export repeats", () => {
  const board = new Board();
  board.load([deck()]);
  board.edit({ budgetEstimated: 150 });
  board.load([deck({ budgetEstimated: 180 })]);
  board.append(lifecycleEvent("edited", ID, "pmo", "2026-09-30T10:00:00.000Z", { patch: { budgetEstimated: 200 } }));
  const later = new Date("2026-10-01T09:00:00.000Z");
  assert.deepEqual(board.load([deck({ budgetEstimated: 180 })], later).events, []);
  assert.equal(board.card()?.budgetEstimated, 200);
  const next = board.load([deck({ budgetEstimated: 190 })], later);
  assert.deepEqual(next.replaced, [{ label: "estimé k€", cardIds: [ID] }]);
  assert.equal(board.card()?.budgetEstimated, 190);
});

test("ADR 060 facts: the same plan de charge in another line order is a repeat — the hand's edit stands", () => {
  const board = new Board();
  const pmo = { profileId: "pmo", jh: 40, done: 10 };
  const dev = { profileId: "dev", jh: 5, done: 0 };
  board.load([deck({ charges: [pmo, dev] })]);
  board.edit({ chargeByProfile: [{ ...pmo, done: 30 }, dev] });
  assert.deepEqual(board.load([deck({ charges: [dev, pmo] })]).events, []);
  assert.deepEqual(board.card()?.chargeByProfile, [{ ...pmo, done: 30 }, dev]);
});

test("ADR 060 facts: several facts of one card ride one event; the domain never does (ADR 036)", () => {
  const board = new Board();
  board.load([deck()]);
  board.edit({ budgetEstimated: 150, owner: "Carl NOYER", domain: "erp" });
  const plan = board.load([deck({ budgetEstimated: 180, owner: "Bruno DIAZ" })]);
  const edited = plan.events.filter((e) => e.type === "edited");
  assert.equal(edited.length, 1);
  assert.deepEqual(edited[0]?.payload["patch"], { owner: "Bruno DIAZ", budgetEstimated: 180 });
  assert.equal(board.card()?.domain, "erp");
});

// Positions: first jalon, hand move, reload jalon → what the load does.
// paused: said « en pause, nouveau jalon non appliqué » — only when a new jalon goes past Pause.
const POSITION_CASES: Array<{ name: string; first: string; hand: string; reload: string; moved: number; divergences: number; advanced: number; paused?: number; column: string }> = [
  { name: "hand move + the same jalon: divergence, the hand stands", first: "etudes", hand: "prets", reload: "etudes", moved: 0, divergences: 1, advanced: 0, column: "prets" },
  { name: "hand move + a newer jalon further along: moved", first: "etudes", hand: "prets", reload: "actifs", moved: 1, divergences: 0, advanced: 1, column: "actifs" },
  { name: "hand move + a newer jalon behind the hand's column: divergence", first: "etudes", hand: "actifs", reload: "prets", moved: 0, divergences: 1, advanced: 0, column: "actifs" },
  { name: "hand move back + a repeated jalon further along: still the hand's (not new)", first: "actifs", hand: "etudes", reload: "actifs", moved: 0, divergences: 1, advanced: 0, column: "etudes" },
  // ADR 060 amendment: Pause is an arbitration decision — no jalon takes a card out of it.
  { name: "put in Pause + a newer jalon further along: stays in Pause, said", first: "prets", hand: "pause", reload: "actifs", moved: 0, divergences: 1, advanced: 0, paused: 1, column: "pause" },
  { name: "put in Pause + a newer jalon behind: stays in Pause, not said", first: "actifs", hand: "pause", reload: "etudes", moved: 0, divergences: 1, advanced: 0, paused: 0, column: "pause" },
  { name: "put in Pause + the same jalon: stays in Pause, not said", first: "prets", hand: "pause", reload: "prets", moved: 0, divergences: 1, advanced: 0, paused: 0, column: "pause" },
];

for (const c of POSITION_CASES) {
  test(`ADR 060 positions: ${c.name}`, () => {
    const board = new Board();
    board.load([deck({ columnId: c.first })]);
    board.move(c.first, c.hand);
    const plan = board.load([deck({ columnId: c.reload })]);
    assert.deepEqual([plan.moved, plan.divergences.length, plan.advanced.length, board.card()?.columnId], [c.moved, c.divergences, c.advanced, c.column]);
    if (c.paused !== undefined) assert.equal(plan.paused.length, c.paused, "paused");
    const again = board.load([deck({ columnId: c.reload })]);
    assert.deepEqual(again.events, [], "reloading the same files writes nothing");
    assert.equal(again.paused.length, 0, "reloading the same files: the jalon is no longer new");
  });
}

test("ADR 060 amendment: a card in Pause is never moved; a new jalon past it is said « en pause »", () => {
  const board = new Board();
  board.load([deck({ columnId: "prets" })]);
  board.move("prets", "pause");
  const plan = board.load([deck({ columnId: "done" })]);
  assert.deepEqual(plan.paused, [{ cardId: ID, title: "Modernisation atelier", fromColumn: "pause", toColumn: "done" }]);
  assert.deepEqual([plan.events.filter((e) => e.type === "moved"), board.card()?.columnId], [[], "pause"]);
  const blind = board.load([deck({ columnId: "demandes", positioned: false })]);
  assert.deepEqual([blind.paused, blind.kept, board.card()?.columnId], [[], 1, "pause"], "no position: nothing to say");
});

test("ADR 060 positions: a load without position keeps the previous import's column in the base — the old jalon stays old", () => {
  const board = new Board();
  board.load([deck({ columnId: "etudes" })]);
  board.move("etudes", "prets");
  const blind = board.load([deck({ columnId: "demandes", positioned: false })]);
  assert.deepEqual([blind.kept, blind.cards[0]?.columnId, blind.cards[0]?.laneId], [1, "etudes", "projets"]);
  const again = board.load([deck({ columnId: "etudes" })]);
  assert.deepEqual([again.moved, again.divergences.length, board.card()?.columnId], [0, 1, "prets"]);
});

test("ADR 060 positions: a first load without jalons, then a jalon past the hand's placement moves the card", () => {
  const board = new Board();
  board.load([deck({ columnId: "demandes", positioned: false })]);
  board.move("demandes", "etudes");
  const plan = board.load([deck({ columnId: "prets" })]);
  assert.deepEqual(plan.advanced, [{ cardId: ID, title: "Modernisation atelier", fromColumn: "etudes", toColumn: "prets" }]);
  assert.equal(board.card()?.columnId, "prets");
});

// A hand-made card (ADR 057) carrying the export's code, in the intake column.
function handMade(board: Board): void {
  const card = testCard({
    id: "S001", title: "Atelier (saisi)", codename: "PE10001", source: "manual", domain: "infra",
    laneId: "projets", columnId: "demandes", typeId: "etude", createdAt: "2026-09-01T08:00:00.000Z", exercise: 2026,
  });
  board.cards.push(card);
  board.append({ ...lifecycleEvent("created", "S001", "pmo", card.createdAt, { laneId: "projets" }), toColumn: "demandes" });
}

test("ADR 060 positions: an adopted hand-made card in Demandes is placed by its jalon Actifs", () => {
  const board = new Board();
  handMade(board);
  const plan = board.load([deck({ columnId: "actifs" })]);
  assert.deepEqual([plan.adopted.length, plan.moved, plan.divergences.length], [1, 1, 0]);
  assert.equal(board.card("S001")?.columnId, "actifs");
});

test("ADR 060 positions: an adopted hand-made card moved by hand is placed by a jalon further along, not by one behind", () => {
  const ahead = new Board();
  handMade(ahead);
  ahead.move("demandes", "etudes", "S001");
  const plan = ahead.load([deck({ columnId: "actifs" })]);
  assert.deepEqual([plan.moved, plan.advanced.length, ahead.card("S001")?.columnId], [1, 1, "actifs"]);
  const behind = new Board();
  handMade(behind);
  behind.move("demandes", "actifs", "S001");
  const back = behind.load([deck({ columnId: "etudes" })]);
  assert.deepEqual([back.moved, back.divergences.length, behind.card("S001")?.columnId], [0, 1, "actifs"]);
});

// ADR 060, amendment 2026-09-30 (author: « si statut c'est terminé, c'est
// que c'est terminé »): a Sciforma done state NEW since the previous import
// takes a card out of Pause; a jalon alone never does; a repeat leaves it.
const DONE_BY_STATE: Partial<EnrichedCard> = { columnId: "done", doneByState: true };
const DONE_BY_JALON: Partial<EnrichedCard> = { columnId: "done" };
const PAUSE_CASES: Array<{ name: string; first: Partial<EnrichedCard>; reload: Partial<EnrichedCard>; unpaused: number; paused: number; divergences: number; column: string }> = [
  { name: "a new done state takes it out of Pause", first: { columnId: "prets" }, reload: DONE_BY_STATE, unpaused: 1, paused: 0, divergences: 0, column: "done" },
  { name: "a new RDR jalon alone does not (en pause — nouveau jalon non appliqué)", first: { columnId: "prets" }, reload: DONE_BY_JALON, unpaused: 0, paused: 1, divergences: 1, column: "pause" },
  { name: "the same done state as the previous import: the hand wins", first: DONE_BY_STATE, reload: DONE_BY_STATE, unpaused: 0, paused: 0, divergences: 1, column: "pause" },
  { name: "a done state where the previous import had only an RDR in Terminé: the state is new", first: DONE_BY_JALON, reload: DONE_BY_STATE, unpaused: 1, paused: 0, divergences: 0, column: "done" },
  { name: "a load without position: kept", first: { columnId: "prets" }, reload: { columnId: "demandes", positioned: false }, unpaused: 0, paused: 0, divergences: 0, column: "pause" },
];

for (const c of PAUSE_CASES) {
  test(`ADR 060 Pause and done state: ${c.name}`, () => {
    const board = new Board();
    board.load([deck(c.first)]);
    board.move(c.first.columnId ?? "etudes", "pause");
    const plan = board.load([deck(c.reload)]);
    assert.deepEqual(
      [plan.unpaused.length, plan.paused.length, plan.divergences.length, plan.moved, board.card()?.columnId],
      [c.unpaused, c.paused, c.divergences, c.unpaused, c.column],
    );
    assert.equal(plan.advanced.length, 0, "leaving Pause is not a hand placement overtaken by a jalon");
    assert.deepEqual(board.load([deck(c.reload)]).events, [], "reloading the same files writes nothing");
  });
}

test("ADR 060 Pause and done state: put back in Pause by hand, the repeated done state leaves it there", () => {
  const board = new Board();
  board.load([deck({ columnId: "actifs" })]);
  board.move("actifs", "pause");
  const out = board.load([deck(DONE_BY_STATE)]);
  assert.deepEqual(out.unpaused, [{ cardId: ID, title: "Modernisation atelier", fromColumn: "pause", toColumn: "done" }]);
  assert.deepEqual(out.events.filter((e) => e.type === "moved").map((e) => [e.actor, e.fromColumn, e.toColumn]), [[IMPORT_ACTOR, "pause", "done"]]);
  board.append(movedEvent(ID, { laneId: "projets", columnId: "done" }, { laneId: "projets", columnId: "pause" }, "pmo", "2026-09-30T10:00:00.000Z"));
  const again = board.load([deck(DONE_BY_STATE)], new Date("2026-10-01T09:00:00.000Z"));
  assert.deepEqual([again.unpaused, again.moved, again.divergences.length, board.card()?.columnId], [[], 0, 1, "pause"]);
});

test("ADR 060 Pause and done state: RDR approved while in Pause, then the state closes on a later load — out of Pause", () => {
  const board = new Board();
  board.load([deck({ columnId: "actifs" })]);
  board.move("actifs", "pause");
  assert.deepEqual([board.load([deck(DONE_BY_JALON)]).paused.length, board.card()?.columnId], [1, "pause"]);
  const closed = board.load([deck(DONE_BY_STATE)], new Date("2026-10-01T09:00:00.000Z"));
  assert.deepEqual([closed.unpaused.length, closed.moved, board.card()?.columnId], [1, 1, "done"]);
});

// doneByState on the base card: kept by a load without position; a base
// stored before the flag existed and already in Terminé reads « not new ».
for (const legacy of [false, true]) {
  test(`ADR 060 Pause and done state: the previous done state is ${legacy ? "read from a legacy base in Terminé" : "kept by a load without position"}`, () => {
    const board = new Board();
    board.load([deck(DONE_BY_STATE)]);
    if (legacy) board.cards = board.cards.map(({ doneByState: _flag, ...card }) => card);
    else board.load([deck({ columnId: "demandes", positioned: false })]);
    board.move("done", "pause");
    const again = board.load([deck(DONE_BY_STATE)], new Date("2026-10-01T09:00:00.000Z"));
    assert.deepEqual([again.unpaused.length, board.card()?.columnId, board.cards[0]?.doneByState], [0, "pause", true]);
  });
}

test("ADR 060 Pause and done state: an adopted hand-made card in Pause has no previous import — its done state takes it out", () => {
  const board = new Board();
  handMade(board);
  board.move("demandes", "pause", "S001");
  const plan = board.load([deck(DONE_BY_STATE)]);
  assert.deepEqual([plan.adopted.length, plan.unpaused.length, board.card("S001")?.columnId], [1, 1, "done"]);
});
