import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ConfigError, reconcileCardRefs, validateBoardConfig } from "./config.ts";
import { testCard, testConfig } from "./test-helpers.ts";
import type { Card } from "./types.ts";

// JSON round-trip clone of the valid test config, loosely typed so each
// table entry can corrupt one field in place.
function rawConfig(): any {
  return JSON.parse(JSON.stringify(testConfig()));
}

test("round-trips a valid config unchanged", () => {
  assert.deepEqual(validateBoardConfig(rawConfig()), testConfig());
});

test("the repository's config/board.json is valid", () => {
  const raw: unknown = JSON.parse(readFileSync(new URL("../config/board.json", import.meta.url), "utf8"));
  const config = validateBoardConfig(raw);
  assert.equal(config.lanes.length, 3);
  assert.equal(config.columns.length, 8);
  assert.equal(config.domains.length, 9);
  assert.equal(config.types.length, 6);
  assert.equal(config.fields.length, 0);
  assert.equal(config.columns.find((c) => c.id === "prets")?.gate, "DoR");
  assert.equal(config.columns.find((c) => c.id === "done")?.gate, "DoD");
  assert.equal(config.columns.find((c) => c.id === "actifs")?.hasBlockedZone, true);
  assert.deepEqual(config.age, { freshMaxDays: 7, recentMaxDays: 28, agingMaxDays: 60 });
  assert.equal(config.andonThresholdDays, 5);
});

test("absent optional fields are normalized (wip/gate null, texts empty, fields [])", () => {
  const raw = rawConfig();
  delete raw.columns[0].wip;
  delete raw.columns[0].gate;
  delete raw.columns[0].note;
  delete raw.lanes[0].nature;
  delete raw.lanes[0].detail;
  delete raw.fields;
  const config = validateBoardConfig(raw);
  assert.equal(config.columns[0]?.wip, null);
  assert.equal(config.columns[0]?.gate, null);
  assert.equal(config.columns[0]?.note, "");
  assert.equal(config.lanes[0]?.nature, "");
  assert.equal(config.lanes[0]?.detail, "");
  assert.deepEqual(config.fields, []);
});

test("fields: select keeps options, other types drop them, showOnCard defaults to false", () => {
  const raw = rawConfig();
  raw.fields = [
    { id: "meteo", name: "Météo", type: "select", showOnCard: true, options: [{ label: "Vert", color: "#10b981" }] },
    { id: "sponsor", name: "Sponsor", type: "person", options: [{ label: "dropped", color: "#fff" }] },
  ];
  const config = validateBoardConfig(raw);
  assert.deepEqual(config.fields[0]?.options, [{ label: "Vert", color: "#10b981" }]);
  assert.equal(config.fields[1]?.showOnCard, false);
  assert.equal(config.fields[1] !== undefined && "options" in config.fields[1], false);
});

test("edge values: wip 1 and andonThresholdDays 1 are accepted", () => {
  const raw = rawConfig();
  raw.columns[0].wip = 1;
  raw.andonThresholdDays = 1;
  const config = validateBoardConfig(raw);
  assert.equal(config.columns[0]?.wip, 1);
  assert.equal(config.andonThresholdDays, 1);
});

test("error messages are French and name the offending field", () => {
  const badWip = rawConfig();
  badWip.columns[1].wip = 0;
  assert.throws(() => validateBoardConfig(badWip), /columns\[1\]\.wip doit être null ou un entier/);
  const extraNature = rawConfig();
  extraNature.natures.chaotic = { label: "Chaotique", bg: "#000", fg: "#fff" };
  assert.throws(() => validateBoardConfig(extraNature), /natures : clé inattendue « chaotic »/);
});

for (const [name, value] of [["a string", "nope"], ["null", null], ["an array", []], ["a number", 42]] as const) {
  test(`rejects a root that is ${name}`, () => {
    assert.throws(() => validateBoardConfig(value), ConfigError);
  });
}

const INVALID_CASES: { name: string; mutate: (raw: any) => void }[] = [
  { name: "missing lanes", mutate: (raw) => delete raw.lanes },
  { name: "empty lanes", mutate: (raw) => (raw.lanes = []) },
  { name: "lanes not an array", mutate: (raw) => (raw.lanes = "x") },
  { name: "lane with empty id", mutate: (raw) => (raw.lanes[0].id = "") },
  { name: "lane without name", mutate: (raw) => delete raw.lanes[0].name },
  { name: "lane nature not a string", mutate: (raw) => (raw.lanes[0].nature = 3) },
  { name: "lane detail not a string", mutate: (raw) => (raw.lanes[0].detail = false) },
  { name: "duplicate lane id", mutate: (raw) => (raw.lanes[1].id = "laneA") },
  { name: "empty columns", mutate: (raw) => (raw.columns = []) },
  { name: "duplicate column id", mutate: (raw) => (raw.columns[1].id = "col1") },
  { name: "wip zero", mutate: (raw) => (raw.columns[0].wip = 0) },
  { name: "wip not an integer", mutate: (raw) => (raw.columns[0].wip = 2.5) },
  { name: "wip as string", mutate: (raw) => (raw.columns[0].wip = "3") },
  { name: "unknown gate code", mutate: (raw) => (raw.columns[0].gate = "DoX") },
  { name: "gate as number", mutate: (raw) => (raw.columns[0].gate = 5) },
  { name: "column note not a string", mutate: (raw) => (raw.columns[0].note = 7) },
  { name: "hasBlockedZone not a boolean", mutate: (raw) => (raw.columns[0].hasBlockedZone = "oui") },
  { name: "empty domains", mutate: (raw) => (raw.domains = []) },
  { name: "duplicate domain id", mutate: (raw) => (raw.domains[1].id = "alpha") },
  { name: "domain without short", mutate: (raw) => delete raw.domains[0].short },
  { name: "domain with empty color", mutate: (raw) => (raw.domains[0].color = "") },
  { name: "missing types", mutate: (raw) => delete raw.types },
  { name: "empty types", mutate: (raw) => (raw.types = []) },
  { name: "duplicate type id", mutate: (raw) => (raw.types[1].id = "t1") },
  { name: "type with empty short", mutate: (raw) => (raw.types[0].short = "") },
  { name: "missing natures", mutate: (raw) => delete raw.natures },
  { name: "natures missing a fixed key", mutate: (raw) => delete raw.natures.complicated },
  { name: "natures with an extra key", mutate: (raw) => (raw.natures.chaotic = { label: "C", bg: "#000", fg: "#fff" }) },
  { name: "nature with empty label", mutate: (raw) => (raw.natures.simple.label = "") },
  { name: "nature without bg", mutate: (raw) => delete raw.natures.simple.bg },
  { name: "criticalities missing a fixed key", mutate: (raw) => delete raw.criticalities.normal },
  { name: "criticalities with an extra key", mutate: (raw) => (raw.criticalities.minor = { label: "Minor", badge: null }) },
  { name: "criticality badge as number", mutate: (raw) => (raw.criticalities.top.badge = 3) },
  { name: "criticality without badge", mutate: (raw) => delete raw.criticalities.normal.badge },
  { name: "criticality without label", mutate: (raw) => delete raw.criticalities.top.label },
  { name: "gateDefs missing DoD", mutate: (raw) => delete raw.gateDefs.DoD },
  { name: "gateDefs with an extra key", mutate: (raw) => (raw.gateDefs.DoX = { name: "X", color: "#000" }) },
  { name: "gateDef with empty name", mutate: (raw) => (raw.gateDefs.DoR.name = "") },
  { name: "gateDef without color", mutate: (raw) => delete raw.gateDefs.DoD.color },
  { name: "fields not an array", mutate: (raw) => (raw.fields = "x") },
  { name: "field with unknown type", mutate: (raw) => (raw.fields = [{ id: "f1", name: "Champ", type: "fancy", showOnCard: false }]) },
  { name: "select field without options", mutate: (raw) => (raw.fields = [{ id: "f1", name: "Champ", type: "select", showOnCard: false }]) },
  { name: "select field options not an array", mutate: (raw) => (raw.fields = [{ id: "f1", name: "Champ", type: "select", options: "a,b" }]) },
  { name: "select option not an object", mutate: (raw) => (raw.fields = [{ id: "f1", name: "Champ", type: "select", options: ["a"] }]) },
  { name: "select option label as number", mutate: (raw) => (raw.fields = [{ id: "f1", name: "Champ", type: "select", options: [{ label: 3, color: "#fff" }] }]) },
  { name: "field showOnCard not a boolean", mutate: (raw) => (raw.fields = [{ id: "f1", name: "Champ", type: "text", showOnCard: "oui" }]) },
  { name: "duplicate field id", mutate: (raw) => (raw.fields = [{ id: "f1", name: "A", type: "text" }, { id: "f1", name: "B", type: "text" }]) },
  { name: "field with empty id", mutate: (raw) => (raw.fields = [{ id: "", name: "A", type: "text" }]) },
  { name: "missing age", mutate: (raw) => delete raw.age },
  { name: "age missing a threshold", mutate: (raw) => delete raw.age.agingMaxDays },
  { name: "age with an extra key", mutate: (raw) => (raw.age.extra = 1) },
  { name: "age fresh threshold zero", mutate: (raw) => (raw.age.freshMaxDays = 0) },
  { name: "age threshold negative", mutate: (raw) => (raw.age.freshMaxDays = -1) },
  { name: "age threshold as string", mutate: (raw) => (raw.age.recentMaxDays = "28") },
  { name: "age thresholds equal", mutate: (raw) => (raw.age.freshMaxDays = 28) },
  { name: "age thresholds not ascending", mutate: (raw) => (raw.age.recentMaxDays = 60) },
  { name: "andon threshold zero", mutate: (raw) => (raw.andonThresholdDays = 0) },
  { name: "andon threshold below one", mutate: (raw) => (raw.andonThresholdDays = 0.5) },
  { name: "andon threshold missing", mutate: (raw) => delete raw.andonThresholdDays },
  { name: "andon threshold NaN", mutate: (raw) => (raw.andonThresholdDays = Number.NaN) },
];

for (const invalid of INVALID_CASES) {
  test(`rejects: ${invalid.name}`, () => {
    const raw = rawConfig();
    invalid.mutate(raw);
    assert.throws(() => validateBoardConfig(raw), ConfigError);
  });
}

// reconcileCardRefs — the base card references the SECOND entry of each
// collection so a fallback to the first entry is observable.
const BASE_REFS = { laneId: "laneB", columnId: "col2", domain: "beta", typeId: "t2" };

const RECONCILE_CASES: {
  name: string;
  overrides: Partial<Card>;
  expected: ReturnType<typeof reconcileCardRefs>;
}[] = [
  { name: "intact refs stay unchanged", overrides: {}, expected: { ...BASE_REFS } },
  { name: "unknown lane falls back to the first lane", overrides: { laneId: "ghost" }, expected: { ...BASE_REFS, laneId: "laneA" } },
  { name: "unknown column falls back to the first column", overrides: { columnId: "ghost" }, expected: { ...BASE_REFS, columnId: "col1" } },
  { name: "unknown domain falls back to the first domain", overrides: { domain: "ghost" }, expected: { ...BASE_REFS, domain: "alpha" } },
  { name: "unknown type falls back to the first type", overrides: { typeId: "ghost" }, expected: { ...BASE_REFS, typeId: "t1" } },
  { name: "null type stays null", overrides: { typeId: null }, expected: { ...BASE_REFS, typeId: null } },
];

for (const entry of RECONCILE_CASES) {
  test(`reconcileCardRefs: ${entry.name}`, () => {
    const card = testCard({ ...BASE_REFS, ...entry.overrides });
    assert.deepEqual(reconcileCardRefs(card, testConfig()), entry.expected);
  });
}
