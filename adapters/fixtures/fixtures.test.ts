// Distribution and card-field tests for the design v9 fixtures port: the
// generator must reproduce design/data.jsx exactly (seed 20260609) against
// the real config/board.json topology.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { createFixtures } from "./index.ts";
import { TOTAL_CARDS, generatePortfolio } from "./generate.ts";
import {
  BLOCK_REASONS,
  CP_NAMES,
  PLAN_CHARGE,
  RESSOURCES,
  SUBJECT_NAMES,
} from "../../fixtures/dataset.ts";

const NOW = new Date("2026-07-06T12:00:00.000Z");
const CONFIG = JSON.parse(
  readFileSync(new URL("../../config/board.json", import.meta.url), "utf8"),
) as BoardConfig;
const PORTFOLIO = generatePortfolio(CONFIG, NOW);

function countBy(values: (string | null)[]): Map<string | null, number> {
  const counts = new Map<string | null, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

test("generation is deterministic for a fixed now, seed changes it", () => {
  const again = generatePortfolio(CONFIG, NOW);
  assert.deepEqual(again.subjects, PORTFOLIO.subjects);
  assert.deepEqual(again.events, PORTFOLIO.events);
  assert.deepEqual(again.financialsById, PORTFOLIO.financialsById);
  const other = generatePortfolio(CONFIG, NOW, 43);
  assert.notDeepEqual(other.subjects, PORTFOLIO.subjects);
});

test("150 subjects with sequential ids S001..S150", () => {
  assert.equal(PORTFOLIO.subjects.length, TOTAL_CARDS);
  PORTFOLIO.subjects.forEach((subject, i) => {
    assert.equal(subject.id, `S${String(i + 1).padStart(3, "0")}`);
  });
});

test("canal x criticality distribution matches the design", () => {
  const cases: [string, { top: number; major: number; normal: number }][] = [
    ["projets", { top: 7, major: 14, normal: 29 }],
    ["petits_projets", { top: 1, major: 8, normal: 51 }],
    ["projets_complexes", { top: 2, major: 8, normal: 30 }],
  ];
  for (const [laneId, expected] of cases) {
    const inLane = PORTFOLIO.subjects.filter((subject) => subject.laneId === laneId);
    const crits = countBy(inLane.map((subject) => subject.criticality));
    assert.equal(crits.get("top") ?? 0, expected.top, laneId);
    assert.equal(crits.get("major") ?? 0, expected.major, laneId);
    assert.equal(crits.get("normal") ?? 0, expected.normal, laneId);
  }
});

test("nature is derived from the canal", () => {
  const expected: Record<string, string> = {
    projets: "complicated",
    petits_projets: "simple",
    projets_complexes: "complex",
  };
  for (const subject of PORTFOLIO.subjects) {
    assert.equal(subject.nature, expected[subject.laneId], subject.id);
  }
});

test("column fill matches the design and pause stays empty", () => {
  const counts = countBy(PORTFOLIO.subjects.map((subject) => subject.columnId));
  const expected: [string, number][] = [
    ["demandes", 23], ["qualification", 18], ["etudes", 27], ["prets", 12],
    ["actifs", 37], ["done", 15], ["exploitation", 18],
  ];
  for (const [columnId, count] of expected) assert.equal(counts.get(columnId) ?? 0, count, columnId);
  assert.equal(counts.get("pause") ?? 0, 0);
});

test("domain and type fills match the design", () => {
  const domains = countBy(PORTFOLIO.subjects.map((subject) => subject.domain));
  const domainFill: [string, number][] = [
    ["ingenierie", 23], ["soutien", 15], ["industrie", 15], ["corporate", 21],
    ["erp", 18], ["plm", 15], ["infra", 18], ["archi_dev", 15], ["cyber", 10],
  ];
  for (const [id, count] of domainFill) assert.equal(domains.get(id) ?? 0, count, id);
  const types = countBy(PORTFOLIO.subjects.map((subject) => subject.typeId));
  const typeFill: [string, number][] = [
    ["mise_en_oeuvre", 40], ["evolution_tma", 35], ["etude", 25],
    ["obsolescence", 20], ["tma_corrective", 18], ["achat", 12],
  ];
  for (const [id, count] of typeFill) assert.equal(types.get(id) ?? 0, count, id);
});

test("every reference resolves against config/board.json", () => {
  const laneIds = new Set(CONFIG.lanes.map((lane) => lane.id));
  const columnIds = new Set(CONFIG.columns.map((column) => column.id));
  const domainIds = new Set(CONFIG.domains.map((domain) => domain.id));
  const typeIds = new Set(CONFIG.types.map((type) => type.id));
  for (const subject of PORTFOLIO.subjects) {
    assert.ok(laneIds.has(subject.laneId), subject.id);
    assert.ok(columnIds.has(subject.columnId), subject.id);
    assert.ok(domainIds.has(subject.domain), subject.id);
    assert.ok(subject.typeId !== null && typeIds.has(subject.typeId), subject.id);
  }
});

test("card fields come from the design pools", () => {
  const titles = new Set<string>();
  const namePool = new Set<string>(SUBJECT_NAMES);
  for (const subject of PORTFOLIO.subjects) {
    assert.ok(CP_NAMES.includes(subject.owner), subject.id);
    assert.ok(subject.loadPlan !== null && PLAN_CHARGE.includes(subject.loadPlan), subject.id);
    assert.ok(subject.resources.length >= 1 && subject.resources.length <= 3, subject.id);
    assert.equal(new Set(subject.resources).size, subject.resources.length, subject.id);
    for (const resource of subject.resources) assert.ok(RESSOURCES.includes(resource), subject.id);
    assert.ok(namePool.has(subject.title), subject.id);
    assert.ok(!titles.has(subject.title), `titre dupliqué : ${subject.title}`);
    titles.add(subject.title);
    assert.match(subject.codename ?? "", /^PX\d{7}$/, subject.id);
    if (subject.sciformaId !== null) assert.match(subject.sciformaId, /^SCF-\d{4}$/, subject.id);
    assert.deepEqual(subject.tags, []);
    assert.deepEqual(subject.dependencies, []);
    assert.deepEqual(subject.custom, {});
    assert.equal(subject.notes, "");
    assert.equal(subject.source, "fixtures");
  }
  const linked = PORTFOLIO.subjects.filter((subject) => subject.sciformaId !== null).length;
  assert.ok(linked > 0 && linked < TOTAL_CARDS, `sciforma: ${linked}`);
});

test("efforts follow the canal bands and the stage consumption ratios", () => {
  const bands: Record<string, [number, number]> = {
    petits_projets: [10, 60], projets: [60, 320], projets_complexes: [40, 260],
  };
  const ratios: Record<string, [number, number]> = {
    demandes: [0, 0], qualification: [0, 0.05], etudes: [0, 0.12], prets: [0, 0.05],
    actifs: [0.15, 0.85], done: [0.85, 1.1], exploitation: [0.9, 1.15],
  };
  for (const subject of PORTFOLIO.subjects) {
    const band = bands[subject.laneId] as [number, number];
    const estimated = subject.effortEstimated as number;
    const consumed = subject.effortConsumed as number;
    assert.ok(estimated >= band[0] && estimated <= band[1], subject.id);
    const ratio = ratios[subject.columnId] as [number, number];
    assert.ok(consumed >= Math.floor(estimated * ratio[0]), subject.id);
    assert.ok(consumed <= Math.ceil(estimated * ratio[1]), subject.id);
  }
});

test("financials carry the budget pair correlated to the effort", () => {
  for (const subject of PORTFOLIO.subjects) {
    // Budgets travel through getFinancials, never on the subject snapshot.
    assert.equal(subject.budgetEstimated, null, subject.id);
    assert.equal(subject.budgetConsumed, null, subject.id);
    const financials = PORTFOLIO.financialsById.get(subject.id);
    assert.ok(financials, subject.id);
    const estimated = subject.effortEstimated as number;
    const budget = financials.budget as number;
    assert.ok(budget >= Math.floor(estimated * 0.5) && budget <= Math.ceil(estimated * 0.9), subject.id);
    const expectedConsumed = Math.round(budget * ((subject.effortConsumed as number) / estimated));
    assert.equal(financials.consumed, expectedConsumed, subject.id);
    assert.equal(financials.remaining, budget - expectedConsumed, subject.id);
  }
});

test("blocked quotas per column match the design", () => {
  const quotas: Record<string, number> = { qualification: 3, etudes: 4, actifs: 9, done: 2 };
  const blocked = PORTFOLIO.subjects.filter((subject) => subject.blocked);
  assert.equal(blocked.length, 18);
  const perColumn = countBy(blocked.map((subject) => subject.columnId));
  for (const column of CONFIG.columns) {
    assert.equal(perColumn.get(column.id) ?? 0, quotas[column.id] ?? 0, column.id);
  }
  for (const subject of blocked) {
    assert.ok(subject.blockedReason !== null && BLOCK_REASONS.includes(subject.blockedReason), subject.id);
    assert.ok(subject.blockedSince !== null, subject.id);
  }
  for (const subject of PORTFOLIO.subjects.filter((s) => !s.blocked)) {
    assert.equal(subject.blockedReason, null, subject.id);
    assert.equal(subject.blockedSince, null, subject.id);
  }
});

test("the adapter answers unknown financial ids with null", () => {
  const { dataSource } = createFixtures(CONFIG, NOW);
  assert.equal(dataSource.getFinancials("GHOST"), null);
  for (const subject of dataSource.listSubjects()) {
    assert.ok(dataSource.getFinancials(subject.id), subject.id);
  }
});

test("the adapter returns deep defensive copies", () => {
  const { dataSource } = createFixtures(CONFIG, NOW);
  const first = dataSource.listSubjects()[0];
  assert.ok(first);
  first.title = "MUTATED";
  first.resources.push("MUTATED");
  first.custom["hack"] = true;
  const again = dataSource.listSubjects()[0];
  assert.notEqual(again?.title, "MUTATED");
  assert.ok(!again?.resources.includes("MUTATED"));
  assert.ok(!("hack" in (again?.custom ?? {})));
  const financials = dataSource.getFinancials(first.id);
  assert.ok(financials);
  financials.budget = -1;
  assert.notEqual(dataSource.getFinancials(first.id)?.budget, -1);
});

test("a topology missing a required id is refused in French", () => {
  const broken: BoardConfig = {
    ...CONFIG,
    columns: CONFIG.columns.filter((column) => column.id !== "actifs"),
  };
  assert.throws(() => generatePortfolio(broken, NOW), /identifiants requis.*colonne actifs/);
});
