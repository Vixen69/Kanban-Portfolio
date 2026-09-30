// ADR 058 — a code-less project's id comes from its name, cut at 48
// characters; two names cut to the same slug take a hash of the full name.
// Which id a load lands on is settled against the board, never by the rest
// of the deck alone: an unchanged project keeps its card whether or not
// its namesake is in the files this time.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig, Card, CardEvent } from "../../core/types.ts";
import { planLoad } from "./to-cards.ts";
import type { LoadPlan } from "./to-cards.ts";
import { baseCardId, disambiguateIds, nameIdCandidates } from "./card-identity.ts";
import type { EnrichedCard } from "./enrich.ts";

const CONFIG = JSON.parse(readFileSync(new URL("../../config/board.json", import.meta.url), "utf8")) as BoardConfig;
const NOW = new Date("2026-09-30T09:00:00.000Z");
const LONG = "programme de modernisation des infrastructures reseau";

function project(suffix: string): EnrichedCard {
  const name = `${LONG} ${suffix}`;
  return {
    title: name, normalizedName: name, codename: null,
    laneId: "projets", domainId: "infra", subDomainId: null, domainSource: "orga", domainRule: null,
    owner: null, typeId: "etude", columnId: "etudes", createdAt: "2026-01-12", dateRdr: null,
    budgetRdli: null, budgetEstimated: 10, budgetConsumed: null, budgetEngaged: null,
    effortEstimated: null, effortConsumed: null, charges: [], pdcKey: null, positioned: true,
    ref: { file: "Projets.csv", line: 2 },
  };
}

// The deck as the audit hands it: fresh cards, the collisions settled.
function deck(...suffixes: string[]): EnrichedCard[] {
  const cards = suffixes.map(project);
  disambiguateIds(cards);
  return cards;
}

interface Board {
  cards: Card[];
  events: CardEvent[];
}

// One load written onto the board (upsert by id, events appended).
function load(board: Board, cards: EnrichedCard[]): { board: Board; plan: LoadPlan } {
  const plan = planLoad(cards, CONFIG, board.cards, board.events, NOW);
  const byId = new Map(board.cards.map((c) => [c.id, c]));
  for (const card of plan.cards) byId.set(card.id, card);
  const events = [...board.events, ...plan.events.map((e, i) => ({ ...e, id: `evt-${board.events.length + i + 1}` }) as CardEvent)];
  return { board: { cards: [...byId.values()], events }, plan };
}

const EMPTY: Board = { cards: [], events: [] };
const unlistedIds = (plan: LoadPlan): string[] => plan.events.filter((e) => e.type === "unlisted").map((e) => e.cardId);

test("the two candidate ids of a long name: the plain slug, and the slug with the full name's hash", () => {
  const names = nameIdCandidates(project("lot a"));
  assert.ok(names !== null);
  assert.equal(names.plain, "IMP-programme-de-modernisation-des-infrastructures-r");
  assert.match(names.hashed, /^IMP-programme-de-modernisation-des-infrastructures-r-[0-9a-f]{8}$/);
  assert.equal(nameIdCandidates({ ...project("lot a"), codename: "PE1" }), null);
  assert.deepEqual([baseCardId(deck("lot a", "lot b")[0]!), baseCardId(deck("lot a")[0]!)], [names.hashed, names.plain], "the deck alone would decide");
});

test("both namesakes loaded, then « lot a » alone: it keeps its card — nothing created, only « lot b » marked absent", () => {
  const first = load(EMPTY, deck("lot a", "lot b"));
  assert.equal(first.plan.created, 2);
  const [a, b] = deck("lot a", "lot b").map((c) => `${baseCardId(c)}@2026`);
  const alone = load(first.board, deck("lot a"));
  assert.deepEqual([alone.plan.created, alone.plan.updated], [0, 1]);
  assert.deepEqual(unlistedIds(alone.plan), [b]);
  assert.equal(alone.plan.aliases.get(`${nameIdCandidates(project("lot a"))?.plain}@2026`), a, "the capacity follows the card");
  const both = load(alone.board, deck("lot a", "lot b"));
  assert.deepEqual([both.plan.created, both.plan.relisted, unlistedIds(both.plan).length], [0, 1, 0], "the next full drop churns nothing");
});

test("« lot a » loaded alone, then with its namesake: it stays on its plain id, « lot b » takes the hashed one", () => {
  const first = load(EMPTY, deck("lot a"));
  const plain = `${nameIdCandidates(project("lot a"))?.plain}@2026`;
  assert.deepEqual(first.board.cards.map((c) => c.id), [plain]);
  const both = load(first.board, deck("lot a", "lot b"));
  assert.deepEqual([both.plan.created, both.plan.updated, unlistedIds(both.plan).length], [1, 1, 0]);
  assert.equal(both.board.cards.find((c) => c.id === plain)?.title, `${LONG} lot a`);
  assert.ok(both.board.cards.some((c) => c.id === `${nameIdCandidates(project("lot b"))?.hashed}@2026` && c.title === `${LONG} lot b`));
  const again = load(both.board, deck("lot a"));
  assert.deepEqual([again.plan.created, unlistedIds(again.plan).length], [0, 1], "only « lot b » is absent");
});

test("the plain id held by another project of the deck is never taken over", () => {
  const first = load(EMPTY, deck("lot b"));
  const both = load(first.board, deck("lot a", "lot b"));
  const plain = `${nameIdCandidates(project("lot a"))?.plain}@2026`;
  assert.equal(both.board.cards.find((c) => c.id === plain)?.title, `${LONG} lot b`, "« lot b » keeps its card");
  assert.deepEqual([both.plan.created, both.plan.identityDoubts], [1, []]);
});

test("a third namesake on the plain id, absent from the files: neither of the two new ones lands on it", () => {
  const first = load(EMPTY, deck("lot c"));
  const both = load(first.board, deck("lot a", "lot b"));
  assert.deepEqual([both.plan.created, both.plan.updated, both.plan.identityDoubts], [2, 0, []]);
  assert.deepEqual(unlistedIds(both.plan), [`${nameIdCandidates(project("lot c"))?.plain}@2026`]);
});
