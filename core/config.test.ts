import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ConfigError, validateBoardConfig } from "./config.ts";

const VALID = {
  lanes: [{ id: "a", name: "A" }],
  columns: [
    { id: "c1", name: "C1", wipLimit: null },
    { id: "c2", name: "C2", wipLimit: 4 },
  ],
  domains: ["D1", "D2"],
  agingStepsDays: [7, 21, 45, 90],
  andonThresholdDays: 5,
};

test("a valid config round-trips with values intact", () => {
  const config = validateBoardConfig(JSON.parse(JSON.stringify(VALID)));
  assert.equal(config.lanes.length, 1);
  assert.equal(config.columns[1]?.wipLimit, 4);
  assert.equal(config.columns[0]?.wipLimit, null);
  assert.deepEqual(config.agingStepsDays, [7, 21, 45, 90]);
  assert.equal(config.andonThresholdDays, 5);
});

test("the repository's config/board.json is valid", () => {
  const raw = readFileSync(new URL("../config/board.json", import.meta.url), "utf8");
  const config = validateBoardConfig(JSON.parse(raw));
  assert.equal(config.lanes.length, 3);
  assert.equal(config.columns.length, 7);
  assert.equal(config.domains.length, 9);
  assert.equal(config.types.length, 6);
  for (const column of config.columns) assert.equal(column.wipLimit, null);
  for (const lane of config.lanes) assert.ok(lane.nature, lane.id);
  for (const type of config.types) assert.ok(type.short, type.id);
});

test("types are optional and lane nature may be absent", () => {
  const config = validateBoardConfig(JSON.parse(JSON.stringify(VALID)));
  assert.deepEqual(config.types, []);
  assert.equal(config.lanes[0]?.nature, undefined);
});

const INVALID_CASES: { name: string; mutate: (raw: Record<string, unknown>) => void }[] = [
  { name: "not an object", mutate: () => undefined }, // replaced below
  { name: "missing lanes", mutate: (raw) => delete raw.lanes },
  { name: "empty columns", mutate: (raw) => (raw.columns = []) },
  { name: "missing domains", mutate: (raw) => delete raw.domains },
  {
    name: "duplicate lane id",
    mutate: (raw) => (raw.lanes = [{ id: "a", name: "A" }, { id: "a", name: "B" }]),
  },
  {
    name: "duplicate column id",
    mutate: (raw) => (raw.columns = [{ id: "c", name: "C", wipLimit: null }, { id: "c", name: "D", wipLimit: null }]),
  },
  { name: "lane without name", mutate: (raw) => (raw.lanes = [{ id: "a" }]) },
  { name: "wipLimit zero", mutate: (raw) => (raw.columns = [{ id: "c", name: "C", wipLimit: 0 }]) },
  { name: "wipLimit not integer", mutate: (raw) => (raw.columns = [{ id: "c", name: "C", wipLimit: 2.5 }]) },
  { name: "wipLimit string", mutate: (raw) => (raw.columns = [{ id: "c", name: "C", wipLimit: "3" }]) },
  { name: "empty domain string", mutate: (raw) => (raw.domains = ["D1", ""]) },
  { name: "duplicate domain", mutate: (raw) => (raw.domains = ["D1", "D1"]) },
  { name: "aging steps empty", mutate: (raw) => (raw.agingStepsDays = []) },
  { name: "aging steps not ascending", mutate: (raw) => (raw.agingStepsDays = [7, 7, 45]) },
  { name: "aging step negative", mutate: (raw) => (raw.agingStepsDays = [-1, 7]) },
  { name: "andon threshold zero", mutate: (raw) => (raw.andonThresholdDays = 0) },
  { name: "andon threshold missing", mutate: (raw) => delete raw.andonThresholdDays },
  { name: "types not an array", mutate: (raw) => (raw.types = "x") },
  { name: "type without short", mutate: (raw) => (raw.types = [{ id: "t", name: "T" }]) },
  { name: "duplicate type id", mutate: (raw) => (raw.types = [{ id: "t", name: "T", short: "T" }, { id: "t", name: "U", short: "U" }]) },
  { name: "lane nature empty", mutate: (raw) => (raw.lanes = [{ id: "a", name: "A", nature: "" }]) },
];

for (const invalid of INVALID_CASES) {
  test(`rejects: ${invalid.name}`, () => {
    if (invalid.name === "not an object") {
      assert.throws(() => validateBoardConfig("nope"), ConfigError);
      return;
    }
    const raw = JSON.parse(JSON.stringify(VALID)) as Record<string, unknown>;
    invalid.mutate(raw);
    assert.throws(() => validateBoardConfig(raw), ConfigError);
  });
}
