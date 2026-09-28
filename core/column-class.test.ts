// The class of each column for the reste à faire (ADR 048): derived from
// the flow anchors and the DoR gate, pinned on the versioned model.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { columnClasses, columnsOfClass } from "./column-class.ts";
import { validateBoardConfig } from "./config.ts";
import { testConfig } from "./test-helpers.ts";
import type { BoardConfig, Column } from "./types.ts";

function versionedModel(): BoardConfig {
  return validateBoardConfig(JSON.parse(readFileSync(new URL("../config/board.json", import.meta.url), "utf8")));
}

function column(id: string, gate: Column["gate"] = null): Column {
  return { id, name: id, gate, review: null, gateStart: null, note: "" };
}

test("the versioned model (author 2026-09-28): Qualification, Études/Cadrage, Actifs engaged; Terminé and after out", () => {
  assert.deepEqual(columnClasses(versionedModel()), {
    demandes: "idle", qualification: "engaged", etudes: "engaged", prets: "idle",
    pause: "idle", actifs: "engaged", done: "excluded", exploitation: "excluded",
  });
  assert.deepEqual(columnsOfClass(versionedModel(), "engaged").map((c) => c.name), ["Qualification", "Études/Cadrage", "Actifs"]);
});

test("a structural topology: the column after the DoR gate is engaged, nothing is terminal without « done » or a DoD", () => {
  assert.deepEqual(columnClasses(testConfig()), { col1: "idle", col2: "idle", col3: "engaged" });
});

test("degraded topologies never throw and never engage a terminal column", () => {
  const base = testConfig();
  assert.deepEqual(columnClasses({ ...base, columns: [] }), {}, "no column, no class");
  const noGate = [column("a"), column("b"), column("c")];
  assert.deepEqual(columnClasses({ ...base, columns: noGate }), { a: "idle", b: "idle", c: "idle" }, "no DoR, no activation: nothing engaged");
  const noTerminal = [column("a"), column("qualification"), column("b"), column("ready", "DoR"), column("run"), column("later")];
  assert.deepEqual(columnClasses({ ...base, columns: noTerminal }), {
    a: "idle", qualification: "engaged", b: "engaged", ready: "idle", run: "engaged", later: "engaged",
  }, "without a terminal column the second span runs to the end");
  const dodFirst = [column("a"), column("end", "DoD"), column("after")];
  assert.deepEqual(columnClasses({ ...base, columns: dodFirst }), { a: "idle", end: "excluded", after: "excluded" });
});
