import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultFilters,
  dimmedCardIds,
  groupCounts,
  isFilterActive,
  laneNatures,
  listOwners,
  passesFilters,
  viewCounts,
} from "./filters.ts";
import { testCard, testConfig } from "./test-helpers.ts";
import type { CardState } from "./types.ts";

const NOW = new Date("2026-06-11T12:00:00.000Z");
const CONFIG = testConfig();

function state(overrides: Parameters<typeof testCard>[0] = {}, daysHere = 1): CardState {
  return {
    ...testCard(overrides),
    enteredColumnAt: new Date(NOW.getTime() - daysHere * 86_400_000).toISOString(),
  };
}

// laneA nature "Clair", laneB nature "Complexe" (see test-helpers).
const PORTFOLIO: CardState[] = [
  state({ id: "S001", domain: "Alpha", owner: "Mme A", typeId: "t1", criticality: "top", codename: "PX1111111" }, 2),
  state({ id: "S002", domain: "Beta", owner: "M. B", typeId: "t2", criticality: "normal" }, 30),
  state(
    { id: "S003", domain: "Alpha", owner: "M. B", blocked: true, blockedSince: NOW.toISOString(), typeId: null, criticality: "major", laneId: "laneB" },
    50,
  ),
  state({ id: "S004", domain: "Beta", owner: "Mme A", typeId: "t1", criticality: "normal", laneId: "laneB" }, 120),
];

test("default filters are neutral: nothing dimmed, not active", () => {
  const filters = defaultFilters(CONFIG);
  assert.equal(isFilterActive(filters), false);
  assert.equal(dimmedCardIds(PORTFOLIO, filters, CONFIG, NOW).size, 0);
});

test("laneNatures lists distinct natures in lane order", () => {
  assert.deepEqual(laneNatures(CONFIG), ["Clair", "Complexe"]);
  const bare = { ...CONFIG, lanes: [{ id: "x", name: "X" }] };
  assert.deepEqual(laneNatures(bare), []);
});

test("each criterion dims the right cards (table)", () => {
  const base = () => defaultFilters(CONFIG);
  const cases: { name: string; mutate: (f: ReturnType<typeof base>) => void; dimmed: string[] }[] = [
    { name: "search by title", mutate: (f) => (f.search = "sujet de test"), dimmed: [] },
    { name: "search no match", mutate: (f) => (f.search = "zzz"), dimmed: ["S001", "S002", "S003", "S004"] },
    { name: "search by codename", mutate: (f) => (f.search = "px111"), dimmed: ["S002", "S003", "S004"] },
    { name: "domain off", mutate: (f) => (f.domains["Alpha"] = false), dimmed: ["S001", "S003"] },
    { name: "type off (untyped passes)", mutate: (f) => (f.types["t1"] = false), dimmed: ["S001", "S004"] },
    { name: "crit top off", mutate: (f) => (f.crits["top"] = false), dimmed: ["S001"] },
    { name: "nature Complexe off", mutate: (f) => (f.natures["Complexe"] = false), dimmed: ["S003", "S004"] },
    { name: "owner", mutate: (f) => (f.owner = "Mme A"), dimmed: ["S002", "S003"] },
    { name: "blocked only", mutate: (f) => (f.blockedOnly = true), dimmed: ["S001", "S002", "S004"] },
    { name: "min age 21", mutate: (f) => (f.minAgeDays = 21), dimmed: ["S001"] },
    { name: "min age 90", mutate: (f) => (f.minAgeDays = 90), dimmed: ["S001", "S002", "S003"] },
  ];
  for (const c of cases) {
    const filters = base();
    c.mutate(filters);
    assert.equal(isFilterActive(filters), true, c.name);
    assert.deepEqual([...dimmedCardIds(PORTFOLIO, filters, CONFIG, NOW)].sort(), c.dimmed, c.name);
  }
});

test("criteria combine with AND", () => {
  const filters = defaultFilters(CONFIG);
  filters.owner = "M. B";
  filters.blockedOnly = true;
  const dimmed = dimmedCardIds(PORTFOLIO, filters, CONFIG, NOW);
  assert.deepEqual([...dimmed].sort(), ["S001", "S002", "S004"]);
  assert.equal(passesFilters(PORTFOLIO[2] as CardState, filters, CONFIG, NOW), true);
});

test("a key missing from a group map counts as enabled", () => {
  const filters = defaultFilters(CONFIG);
  delete filters.domains["Alpha"];
  delete filters.crits["top"];
  assert.equal(passesFilters(PORTFOLIO[0] as CardState, filters, CONFIG, NOW), true);
});

test("viewCounts: lit counts against totals, including criticalities", () => {
  const filters = defaultFilters(CONFIG);
  filters.owner = "M. B";
  const dimmed = dimmedCardIds(PORTFOLIO, filters, CONFIG, NOW);
  const counts = viewCounts(PORTFOLIO, dimmed, CONFIG, NOW);
  assert.equal(counts.total, 4);
  assert.equal(counts.shown, 2);
  assert.deepEqual(counts.blocked, { shown: 1, total: 1 });
  assert.deepEqual(counts.stale, { shown: 0, total: 1 }); // S004 dimmed
  assert.deepEqual(counts.crits.top, { shown: 0, total: 1 });
  assert.deepEqual(counts.crits.major, { shown: 1, total: 1 });
  assert.deepEqual(counts.crits.normal, { shown: 1, total: 2 });
});

test("groupCounts follow key order and the dimmed set", () => {
  const filters = defaultFilters(CONFIG);
  filters.blockedOnly = true;
  const dimmed = dimmedCardIds(PORTFOLIO, filters, CONFIG, NOW);
  const perDomain = groupCounts(PORTFOLIO, dimmed, CONFIG.domains, (card) => card.domain);
  assert.deepEqual(perDomain["Alpha"], { shown: 1, total: 2 });
  assert.deepEqual(perDomain["Beta"], { shown: 0, total: 2 });
  const natures = laneNatures(CONFIG);
  const natureOf = (card: CardState) => CONFIG.lanes.find((lane) => lane.id === card.laneId)?.nature ?? null;
  const perNature = groupCounts(PORTFOLIO, dimmed, natures, natureOf);
  assert.deepEqual(perNature["Clair"], { shown: 0, total: 2 });
  assert.deepEqual(perNature["Complexe"], { shown: 1, total: 2 });
});

test("listOwners is distinct and sorted", () => {
  assert.deepEqual(listOwners(PORTFOLIO), ["M. B", "Mme A"]);
});
