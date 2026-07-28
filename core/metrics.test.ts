import { test } from "node:test";
import assert from "node:assert/strict";
import type { BoardConfig, CardEvent, CardState } from "./types.ts";
import { computePortfolioMetrics } from "./metrics.ts";
import { blockages, constraintCounts, riskCounts, wipRows } from "./metrics-flow.ts";
import { terminalColumnIds } from "./flow.ts";
import { testCard, testConfig } from "./test-helpers.ts";

const NOW = new Date("2026-06-11T12:00:00.000Z");
const DAY_MS = 86_400_000;

// A 4-stage topology so the activation anchor (right after the DoR gate)
// and the terminal anchor (the DoD gate) do not collapse onto one column —
// otherwise every cycle time would trivially read 0.
function metricsConfig(): BoardConfig {
  const config = testConfig();
  config.columns = [
    { id: "col1", name: "Demandes", wip: null, gate: null, note: "" },
    { id: "col2", name: "Prêts", wip: 3, gate: "DoR", note: "" },
    { id: "col3", name: "Actifs", wip: 2, gate: null, note: "" },
    { id: "col4", name: "Done", wip: null, gate: "DoD", note: "" },
  ];
  return config;
}

const CONFIG = metricsConfig(); // 2 lanes (laneA, laneB), 4 columns

function ago(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function state(overrides: Parameters<typeof testCard>[0] = {}, daysHere = 1): CardState {
  return {
    ...testCard(overrides),
    enteredColumnAt: ago(daysHere),
    comments: [],
    archived: false,
  };
}

let seq = 0;
function entry(cardId: string, toColumn: string, daysAgo: number, type: CardEvent["type"] = "moved"): CardEvent {
  return {
    id: `evt-${++seq}`,
    ts: ago(daysAgo),
    actor: "test",
    cardId,
    type,
    fromColumn: null,
    toColumn,
    payload: {},
  };
}

const CARDS: CardState[] = [
  state(
    {
      id: "S001",
      columnId: "col4",
      budgetRdli: 100, budgetEstimated: 90, budgetEngaged: 70, budgetConsumed: 30,
      chargeByProfile: [{ profileId: "pA", jh: 100, done: 40 }],
      risks: [{ type: "rSSG", desc: "" }],
      projectConstraints: ["legale"],
    },
    10,
  ),
  state(
    {
      id: "S002",
      columnId: "col4",
      budgetRdli: 100, budgetEstimated: 60, budgetEngaged: 50, budgetConsumed: 20,
      chargeByProfile: [{ profileId: "pB", jh: 50, done: 10 }],
      risks: [{ type: "rSSG", desc: "" }, { type: "rInfra", desc: "" }],
      projectConstraints: ["legale", "groupe"],
    },
    50,
  ),
  state(
    { id: "S003", columnId: "col3", blocked: true, blockedReason: "Attente arbitrage", contentionProfiles: ["pA"] },
    12,
  ),
  state({ id: "S004", columnId: "col1", contentionProfiles: ["pGhost"] }, 3),
  { ...state({ id: "S005", columnId: "col4", budgetRdli: 9999 }, 1), archived: true },
];

const EVENTS: CardEvent[] = [
  entry("S001", "col1", 40, "created"),
  entry("S001", "col3", 30),
  entry("S001", "col4", 10),
  entry("S002", "col1", 100, "created"),
  entry("S002", "col3", 90),
  entry("S002", "col4", 50),
  entry("S003", "col1", 30, "created"),
  entry("S003", "col3", 12),
  entry("S004", "col1", 3, "created"),
];

test("terminal columns are derived from the config, never hardcoded", () => {
  assert.deepEqual([...terminalColumnIds(CONFIG)].sort(), ["col4"]);
  // Renaming the gated column moves the anchor instead of zeroing the view.
  const renamed = metricsConfig();
  renamed.columns = renamed.columns.map((c) => (c.id === "col4" ? { ...c, id: "livre" } : c));
  assert.deepEqual([...terminalColumnIds(renamed)].sort(), ["livre"]);
});

test("archived cards are excluded from every aggregate", () => {
  const metrics = computePortfolioMetrics(CARDS, EVENTS, CONFIG, NOW);
  assert.equal(metrics.activeCount, 4);
  // S005 carries an RDLI of 9999 — if it leaked, the envelope would explode.
  assert.equal(metrics.budget.rdli, 200);
});

test("head-line counts split in-flow, finished and blocked", () => {
  const metrics = computePortfolioMetrics(CARDS, EVENTS, CONFIG, NOW);
  assert.equal(metrics.inFlowCount, 2); // S003 (col3), S004 (col1)
  assert.equal(metrics.finishedCount, 2); // S001, S002 (col4)
  assert.equal(metrics.blockedCount, 1); // S003
});

test("budget croisé sums each field and reads as a share of the RDLI envelope", () => {
  const metrics = computePortfolioMetrics(CARDS, EVENTS, CONFIG, NOW);
  assert.equal(metrics.budget.rdli, 200);
  assert.equal(metrics.budget.estimated, 150);
  assert.equal(metrics.budget.engaged, 120);
  assert.equal(metrics.budget.consumed, 50);
  assert.equal(metrics.engagedPct, 60);
  assert.equal(metrics.consumedPct, 25);
  assert.equal(metrics.remainingTotal, 100); // 150 j.h planned - 50 consumed
});

test("an unknown RDLI envelope reads 0 %, never Infinity", () => {
  const noEnvelope = [state({ id: "X1", budgetEngaged: 40, budgetConsumed: 10 })];
  const metrics = computePortfolioMetrics(noEnvelope, [], CONFIG, NOW);
  assert.equal(metrics.budget.rdli, 0);
  assert.equal(metrics.engagedPct, 0);
  assert.equal(metrics.consumedPct, 0);
  assert.equal(Number.isFinite(metrics.engagedPct), true);
});

test("roles merge charge and contention, tension first", () => {
  const metrics = computePortfolioMetrics(CARDS, EVENTS, CONFIG, NOW);
  assert.deepEqual(
    metrics.roles.map((role) => [role.id, role.remaining, role.contention]),
    [
      ["pA", 60, 1], // flagged AND heaviest
      ["pGhost", 0, 1], // flagged with no charge planned — that IS the warning
      ["pB", 40, 0],
    ],
  );
  assert.deepEqual(metrics.contention.map((role) => role.id), ["pA", "pGhost"]);
});

test("a profile is counted once per card even if flagged twice", () => {
  const twice = [state({ id: "X1", contentionProfiles: ["pA", "pA"] })];
  const metrics = computePortfolioMetrics(twice, [], CONFIG, NOW);
  assert.equal(metrics.roles.find((role) => role.id === "pA")?.contention, 1);
});

test("flow summary reports débit over 30/90 days and average lead/cycle", () => {
  const { flow } = computePortfolioMetrics(CARDS, EVENTS, CONFIG, NOW);
  assert.equal(flow.throughput30, 1); // S001 delivered 10 days ago
  assert.equal(flow.throughput90, 2); // + S002 delivered 50 days ago
  assert.equal(flow.leadTimeAvg, 40); // (40-10) and (100-50) => (30 + 50) / 2
  assert.equal(flow.cycleTimeAvg, 30); // (30-10) and (90-50) => (20 + 40) / 2
});

test("a portfolio with nothing delivered yields zeros and null averages", () => {
  const { flow } = computePortfolioMetrics([CARDS[3] as CardState], EVENTS, CONFIG, NOW);
  assert.deepEqual(flow, { throughput30: 0, throughput90: 0, leadTimeAvg: null, cycleTimeAvg: null });
});

test("wip rows cumulate the column limit across canaux and exclude delivered work", () => {
  const rows = wipRows(CARDS.filter((card) => !card.archived), CONFIG);
  assert.deepEqual(
    rows.map((row) => [row.id, row.count, row.limit, row.over]),
    [
      ["col1", 1, 0, false], // no WIP set => limit 0, never « over »
      ["col2", 0, 6, false], // wip 3 x 2 canaux
      ["col3", 1, 4, false], // wip 2 x 2 canaux
      ["col4", 0, 0, false], // terminal: delivered work is not encours
    ],
  );
});

test("wip flags a column past its cumulated limit", () => {
  const crowded = Array.from({ length: 7 }, (_, i) => state({ id: `C${i}`, columnId: "col2" }));
  const row = wipRows(crowded, CONFIG).find((candidate) => candidate.id === "col2");
  assert.equal(row?.count, 7);
  assert.equal(row?.limit, 6);
  assert.equal(row?.over, true);
});

test("blockages list the blocked cards, oldest first, with their column name", () => {
  const rows = blockages(CARDS.filter((card) => !card.archived), CONFIG, NOW);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    id: "S003",
    title: "Sujet de test",
    reason: "Attente arbitrage",
    columnName: "Actifs",
    days: 12,
  });
});

test("blockages sort by decreasing days in column", () => {
  const many = [
    state({ id: "B1", blocked: true, blockedReason: null }, 3),
    state({ id: "B2", blocked: true, blockedReason: null }, 40),
    state({ id: "B3", blocked: true, blockedReason: null }, 15),
  ];
  assert.deepEqual(blockages(many, CONFIG, NOW).map((row) => row.id), ["B2", "B3", "B1"]);
});

test("risk counts follow the config typology and drop empty types", () => {
  const rows = riskCounts(CARDS.filter((card) => !card.archived), CONFIG);
  assert.deepEqual(rows.map((row) => [row.id, row.count]), [["rSSG", 2], ["rInfra", 1]]);
});

test("constraint counts keep every configured chip plus the « Aucune » row", () => {
  const rows = constraintCounts(CARDS.filter((card) => !card.archived), CONFIG);
  assert.deepEqual(
    rows.map((row) => [row.id, row.name, row.count]),
    [["legale", "Légale", 2], ["groupe", "Groupe", 1], ["aucune", "Aucune", 2]],
  );
});

test("an empty portfolio computes without throwing", () => {
  const metrics = computePortfolioMetrics([], [], CONFIG, NOW);
  assert.equal(metrics.activeCount, 0);
  assert.equal(metrics.remainingTotal, 0);
  assert.deepEqual(metrics.roles, []);
  assert.deepEqual(metrics.blockages, []);
  assert.equal(metrics.flow.leadTimeAvg, null);
});
