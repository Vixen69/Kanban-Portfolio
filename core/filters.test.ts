import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cardMatches,
  defaultFilters,
  dimmedCardIds,
  isFilterActive,
  portfolioCounts,
  viewCounts,
  type FilterState,
} from "./filters.ts";
import { testCard, testConfig } from "./test-helpers.ts";
import type { CardState } from "./types.ts";

const NOW = new Date("2026-06-11T12:00:00.000Z");
const CONFIG = testConfig();

function state(overrides: Parameters<typeof testCard>[0] = {}, daysHere = 1): CardState {
  return {
    ...testCard(overrides),
    enteredColumnAt: new Date(NOW.getTime() - daysHere * 86_400_000).toISOString(),
    comments: [],
    archived: false,
  };
}

// Age thresholds from testConfig: stale beyond 60 days in column.
// Project constraints are spread on purpose — one single, one double, one
// bare — so the OR-shaped constraint predicate is actually exercised.
const PORTFOLIO: CardState[] = [
  state(
    { id: "S001", title: "Refonte GMAO", domain: "alpha", typeId: "t1", criticality: "top", nature: "simple", codename: "PX1111111", projectConstraints: ["legale"] },
    2,
  ),
  state(
    { id: "S002", title: "Sujet Beta", domain: "beta", typeId: "t2", criticality: "normal", nature: "complicated", codename: "PX2222222", projectConstraints: ["legale", "groupe"] },
    30,
  ),
  state(
    {
      id: "S003",
      title: "Migration ERP",
      domain: "alpha",
      typeId: null,
      criticality: "major",
      nature: "complex",
      codename: null,
      blocked: true,
      blockedSince: "2026-06-01T00:00:00.000Z",
    },
    50,
  ),
  state(
    { id: "S004", title: "Sujet Delta", domain: "beta", typeId: "t1", criticality: "normal", nature: "simple", codename: "PX4444444", projectConstraints: ["groupe"] },
    120,
  ),
];

test("default filters are neutral: every key true, blockedOnly off, nothing dimmed", () => {
  const filters = defaultFilters(CONFIG);
  assert.deepEqual(filters.type, { t1: true, t2: true });
  assert.deepEqual(filters.domain, { alpha: true, beta: true });
  assert.deepEqual(filters.crit, { top: true, major: true, normal: true });
  assert.deepEqual(filters.constraint, { legale: true, groupe: true });
  assert.equal(filters.noConstraint, true);
  assert.equal(filters.blockedOnly, false);
  assert.equal(isFilterActive(filters), false);
  assert.equal(dimmedCardIds(PORTFOLIO, filters).size, 0);
});

test("a blank search stays inactive", () => {
  const filters = defaultFilters(CONFIG);
  filters.search = "   ";
  assert.equal(isFilterActive(filters), false);
  assert.equal(dimmedCardIds(PORTFOLIO, filters).size, 0);
});

test("each filter dimension dims the right cards (table)", () => {
  const cases: { name: string; mutate: (filters: FilterState) => void; dimmed: string[] }[] = [
    { name: "search by title, case-insensitive", mutate: (f) => (f.search = "SUJET"), dimmed: ["S001", "S003"] },
    { name: "search matches codename, trimmed", mutate: (f) => (f.search = "  px111  "), dimmed: ["S002", "S003", "S004"] },
    { name: "search without match dims all", mutate: (f) => (f.search = "zzz"), dimmed: ["S001", "S002", "S003", "S004"] },
    { name: "domain off", mutate: (f) => (f.domain["alpha"] = false), dimmed: ["S001", "S003"] },
    { name: "type off (null typeId passes)", mutate: (f) => (f.type["t1"] = false), dimmed: ["S001", "S004"] },
    { name: "crit top off", mutate: (f) => (f.crit.top = false), dimmed: ["S001"] },
    { name: "crit normal off", mutate: (f) => (f.crit.normal = false), dimmed: ["S002", "S004"] },
    { name: "bloqués uniquement dims every unblocked card", mutate: (f) => (f.blockedOnly = true), dimmed: ["S001", "S002", "S004"] },
    // OR-shaped: S002 wears both constraints and survives while either pill is on.
    { name: "constraint légale off", mutate: (f) => (f.constraint["legale"] = false), dimmed: ["S001"] },
    { name: "constraint groupe off", mutate: (f) => (f.constraint["groupe"] = false), dimmed: ["S004"] },
    {
      name: "both constraints off leaves only the unconstrained card",
      mutate: (f) => {
        f.constraint["legale"] = false;
        f.constraint["groupe"] = false;
      },
      dimmed: ["S001", "S002", "S004"],
    },
    { name: "aucune off dims the card carrying no constraint", mutate: (f) => (f.noConstraint = false), dimmed: ["S003"] },
  ];
  for (const c of cases) {
    const filters = defaultFilters(CONFIG);
    c.mutate(filters);
    assert.equal(isFilterActive(filters), true, c.name);
    assert.deepEqual([...dimmedCardIds(PORTFOLIO, filters)].sort(), c.dimmed, c.name);
  }
});

test("criteria combine with AND across search and groups", () => {
  const filters = defaultFilters(CONFIG);
  filters.search = "px"; // S003 has no codename and no "px" in its title
  filters.type["t1"] = false;
  assert.deepEqual([...dimmedCardIds(PORTFOLIO, filters)].sort(), ["S001", "S003", "S004"]);
});

test("a key missing from a group map counts as enabled", () => {
  const filters = defaultFilters(CONFIG);
  delete filters.domain["alpha"];
  delete (filters.crit as Record<string, boolean>)["top"];
  delete filters.constraint["legale"];
  assert.equal(cardMatches(PORTFOLIO[0] as CardState, filters), true);
});

test("« Aucune » is independent of the constraint pills in both directions", () => {
  const bare = PORTFOLIO[2] as CardState; // S003 carries no constraint
  const constrained = PORTFOLIO[0] as CardState; // S001 carries « legale »
  const onlyBare = defaultFilters(CONFIG);
  onlyBare.constraint["legale"] = false;
  onlyBare.constraint["groupe"] = false;
  assert.equal(cardMatches(bare, onlyBare), true);
  assert.equal(cardMatches(constrained, onlyBare), false);
  const onlyConstrained = defaultFilters(CONFIG);
  onlyConstrained.noConstraint = false;
  assert.equal(cardMatches(bare, onlyConstrained), false);
  assert.equal(cardMatches(constrained, onlyConstrained), true);
});

test("isFilterActive sees a constraint pill and the aucune pill", () => {
  const pillOff = defaultFilters(CONFIG);
  pillOff.constraint["groupe"] = false;
  assert.equal(isFilterActive(pillOff), true);
  const aucuneOff = defaultFilters(CONFIG);
  aucuneOff.noConstraint = false;
  assert.equal(isFilterActive(aucuneOff), true);
});

test("viewCounts tallies only non-dimmed cards against the portfolio total", () => {
  const filters = defaultFilters(CONFIG);
  filters.domain["beta"] = false; // dims S002 and S004 (the stale one)
  const dimmed = dimmedCardIds(PORTFOLIO, filters);
  assert.deepEqual(viewCounts(PORTFOLIO, dimmed, CONFIG, NOW), {
    shown: 2,
    total: 4,
    blocked: 1,
    stale: 0,
    top: 1,
    major: 1,
    normal: 0,
  });
});

test("portfolioCounts ignores filters: shown equals total", () => {
  assert.deepEqual(portfolioCounts(PORTFOLIO, CONFIG, NOW), {
    shown: 4,
    total: 4,
    blocked: 1,
    stale: 1,
    top: 1,
    major: 1,
    normal: 2,
  });
});

test("neutral viewCounts equals portfolioCounts", () => {
  const dimmed = dimmedCardIds(PORTFOLIO, defaultFilters(CONFIG));
  assert.deepEqual(viewCounts(PORTFOLIO, dimmed, CONFIG, NOW), portfolioCounts(PORTFOLIO, CONFIG, NOW));
});
