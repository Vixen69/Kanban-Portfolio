// The grouped changes as the PMO reads them (ADR 053/055): the sections,
// their order and folding, and the words and numbers of one row.

import { test } from "node:test";
import assert from "node:assert/strict";
import { testConfig } from "../core/test-helpers.ts";
import type { CardChange, FigureFact, PlanChange } from "../core/snapshot-diff.ts";
import {
  capitalized, changeKey, changeWords, fmtFigure, frDay, groupChanges, planDelta, planPair, planSummary, profileName, sectionOpen, signedDelta,
  trendTone,
} from "./changeGroups.ts";
import type { TrendMeasure, TrendTone } from "./changeGroups.ts";

const NBSP = String.fromCharCode(0x202f);
const base = { title: "Projet", codename: "PE1", exercise: 2026 };

function text(kind: Exclude<CardChange["kind"], "figure" | "plan">, cardId: string, from: string | null = null, to: string | null = null): CardChange {
  return { ...base, cardId, kind, from, to };
}

function figure(cardId: string, fact: FigureFact, before: number | null, after: number | null): CardChange {
  const delta = before === null || after === null ? null : after - before;
  return { ...base, cardId, kind: "figure", from: null, to: null, figure: { fact, unit: "k€", before, after, delta } };
}

const PLAN: PlanChange = {
  before: { planned: 100, done: 20, raf: 80, breakdown: true },
  after: { planned: 120.25, done: 30, raf: 90.25, breakdown: true },
  profiles: [],
};

function plan(cardId: string): CardChange {
  return { ...base, cardId, kind: "plan", from: null, to: null, plan: PLAN };
}

const MIXED: CardChange[] = [
  text("added", "c1"), text("absent", "c2"), text("moved", "c3", "demandes", "etudes|projets"),
  figure("c4", "budgetRdli", 10, 12), figure("c5", "budgetEstimated", 5, 4), figure("c6", "budgetEstimated", 1, 2),
  plan("c7"), text("owner", "c8", "A", "B"), text("archived", "c9"), text("title", "c10", "Ancien", "Nouveau"),
];

test("groupChanges « values »: refreshed values in reading order, arrivals and absences left to their lists", () => {
  const sections = groupChanges(MIXED, "values");
  assert.deepEqual(sections.map((s) => s.key), [
    "plan", "figure:budgetEstimated", "figure:budgetRdli", "owner", "title", "moved", "archived",
  ]);
  assert.deepEqual(sections.map((s) => s.label), [
    "Plan de charge", "Estimé k€", "Enveloppe RDLI k€", "Chef de projet", "Titre", "Déplacés", "Archivés",
  ]);
  assert.deepEqual(sections[1]?.items.map((c) => c.cardId), ["c5", "c6"], "the engine's order kept inside a section");
});

test("groupChanges « all »: presence first, then the values, then the archiving; nothing empty", () => {
  const keys = groupChanges(MIXED, "all").map((s) => s.key);
  assert.deepEqual(keys.slice(0, 3), ["added", "absent", "plan"]);
  assert.equal(keys.at(-1), "archived");
  assert.deepEqual(groupChanges([], "all"), []);
});

test("sectionOpen: only the first section, and only when short", () => {
  const cases: Array<[number, number, boolean]> = [[0, 1, true], [0, 30, true], [0, 31, false], [1, 1, false]];
  for (const [index, rows, open] of cases) assert.equal(sectionOpen(index, rows), open, `${index}/${rows}`);
});

test("changeWords: config names, French dates, texts, and a dash for none", () => {
  const config = testConfig();
  const cases: Array<[CardChange["kind"], string | null, string]> = [
    ["domain", "beta", "Beta"], ["domain", "ghost", "ghost"], ["type", "t2", "Type 2"],
    ["moved", "col2", "Colonne 2"], ["moved", "col3|laneB", "Colonne 3 · Lane B"],
    ["dateRdr", "2026-10-01", "01/10/2026"], ["owner", "M. Dupont", "M. Dupont"], ["owner", null, "—"], ["title", "", "—"],
  ];
  for (const [kind, value, expected] of cases) assert.equal(changeWords(config, kind, value), expected, `${kind} ${value}`);
  assert.equal(frDay("pas une date"), "pas une date");
});

test("signedDelta: the direction and the signed French text, nothing when flat or unknown", () => {
  const cases: Array<[number | null, ReturnType<typeof signedDelta>]> = [
    [12.5, { trend: "up", text: "+12,5" }], [-3, { trend: "down", text: "−3" }], [1250, { trend: "up", text: `+1${NBSP}250` }],
    [0, { trend: null, text: "" }], [0.004, { trend: null, text: "" }], [null, { trend: null, text: "" }],
    // The engine lists a change from the hundredth: its direction shows (« ça bouge à chaque fois un petit peu »).
    [0.03, { trend: "up", text: "+0,03" }], [-0.01, { trend: "down", text: "−0,01" }],
  ];
  for (const [delta, expected] of cases) assert.deepEqual(signedDelta(delta), expected, String(delta));
});

test("fmtFigure and planPair: two decimals at most — the engine's precision — a dash for none", () => {
  const cases: Array<[number | null, string]> = [[null, "—"], [24.52, "24,52"], [12.31, "12,31"], [12.34, "12,34"], [24.526, "24,53"], [7, "7"]];
  for (const [value, expected] of cases) assert.equal(fmtFigure(value), expected, String(value));
  assert.equal(planPair(PLAN.before, PLAN.after, "planned"), "100 → 120,25");
  const small = { planned: 1.04, done: 0, raf: 1.04 };
  assert.equal(planPair(small, { ...small, planned: 1.01 }, "planned"), "1,04 → 1,01", "a listed change never reads « 1 → 1 »");
});

test("planSummary: prévu and RAF, « sans ventilation » for a side without plan", () => {
  assert.equal(planSummary(PLAN), "prévu 100 → 120,25 j.h · RAF 80 → 90,25 j.h");
  const fresh: PlanChange = { ...PLAN, before: { planned: 0, done: 0, raf: 0, breakdown: false } };
  assert.equal(planSummary(fresh), "prévu sans ventilation → 120,25 j.h · RAF sans ventilation → 90,25 j.h");
  const nudge: PlanChange = {
    before: { planned: 10.25, done: 0, raf: 10.25, breakdown: true }, after: { planned: 10.3, done: 0, raf: 10.3, breakdown: true }, profiles: [],
  };
  assert.equal(planSummary(nudge), "prévu 10,25 → 10,3 j.h · RAF 10,25 → 10,3 j.h");
});

test("planDelta: rounded to the hundredth, float noise never decides a direction", () => {
  const cases: Array<[number, number, number]> = [[0.1, 0.3, 0.2], [10.25, 10.3, 0.05], [0.3, 0.1 + 0.2, 0], [5, 2, -3]];
  for (const [before, after, expected] of cases) assert.equal(planDelta(before, after), expected, `${before} → ${after}`);
  assert.deepEqual(signedDelta(planDelta(0.3, 0.1 + 0.2)), { trend: null, text: "" });
});

test("profileName and changeKey", () => {
  const config = testConfig();
  const known = config.profiles[0];
  assert.ok(known !== undefined);
  assert.equal(profileName(config, known.id), known.name);
  assert.equal(profileName(config, "ghost"), "ghost");
  assert.equal(changeKey(figure("c1", "budgetRdli", 1, 2)), "figure:budgetRdli:c1");
  assert.equal(changeKey(text("moved", "c1")), "moved:c1");
});

test("capitalized: a label as a section title", () => {
  const cases: Array<[string, string]> = [["chef de projet", "Chef de projet"], ["", ""], ["Déjà", "Déjà"], ["été", "Été"]];
  for (const [text, expected] of cases) assert.equal(capitalized(text), expected);
});

test("trendTone: progress neutral, a growing demand amber, less left to do green, other falls neutral", () => {
  const cases: Array<[TrendMeasure, "up" | "down", TrendTone]> = [
    ["budgetConsumed", "up", "neutral"], ["budgetEngaged", "up", "neutral"], ["effortConsumed", "up", "neutral"],
    ["budgetEstimated", "up", "warn"], ["budgetRdli", "up", "warn"], ["effortEstimated", "up", "warn"],
    ["planned", "up", "warn"], ["raf", "up", "warn"],
    ["raf", "down", "ok"], ["budgetEstimated", "down", "ok"],
    ["budgetConsumed", "down", "neutral"], ["budgetEngaged", "down", "neutral"], ["effortConsumed", "down", "neutral"],
    ["budgetRdli", "down", "neutral"], ["effortEstimated", "down", "neutral"], ["planned", "down", "neutral"],
  ];
  for (const [measure, trend, tone] of cases) assert.equal(trendTone(measure, trend), tone, `${measure} ${trend}`);
  assert.equal(trendTone("raf", null), null, "no trend, no mark");
});
