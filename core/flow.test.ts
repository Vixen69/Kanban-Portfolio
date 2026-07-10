import { test } from "node:test";
import assert from "node:assert/strict";
import type { BoardConfig, CardEvent } from "./types.ts";
import { flowTimes, resolveFlowAnchors } from "./flow.ts";
import { testConfig } from "./test-helpers.ts";

const NOW = new Date("2026-07-01T00:00:00.000Z");

function event(partial: Partial<CardEvent> & Pick<CardEvent, "id" | "ts" | "type">): CardEvent {
  return { actor: "sciforma-sync", cardId: "S001", fromColumn: null, toColumn: null, payload: {}, ...partial };
}

// An NMO-shaped config: named anchors present (qualification/actifs/done).
function nmoConfig(): BoardConfig {
  const config = testConfig();
  config.columns = [
    { id: "demandes", name: "Demandes", wip: null, gate: null, note: "" },
    { id: "qualification", name: "Qualification", wip: null, gate: null, note: "" },
    { id: "prets", name: "Prêts", wip: null, gate: "DoR", note: "" },
    { id: "actifs", name: "Actifs", wip: null, gate: null, note: "" },
    { id: "done", name: "Done", wip: null, gate: "DoD", note: "" },
    { id: "exploitation", name: "Exploitation", wip: null, gate: null, note: "" },
  ];
  return config;
}

test("anchors resolve by NMO ids when present", () => {
  const anchors = resolveFlowAnchors(nmoConfig());
  assert.equal(anchors?.entry.id, "demandes");
  assert.equal(anchors?.qualification?.id, "qualification");
  assert.equal(anchors?.activation?.id, "actifs");
  assert.equal(anchors?.terminal?.id, "done");
});

test("anchors fall back to structure: second column, post-DoR column, DoD gate", () => {
  // testConfig: col1 / col2 (DoR) / col3 — no NMO ids, no DoD gate.
  const anchors = resolveFlowAnchors(testConfig());
  assert.equal(anchors?.entry.id, "col1");
  assert.equal(anchors?.qualification?.id, "col2");
  assert.equal(anchors?.activation?.id, "col3");
  assert.equal(anchors?.terminal, null);
  const dod = testConfig();
  dod.columns = [
    { id: "a", name: "A", wip: null, gate: null, note: "" },
    { id: "b", name: "B", wip: null, gate: "DoD", note: "" },
  ];
  assert.equal(resolveFlowAnchors(dod)?.terminal?.id, "b");
});

test("an empty topology yields no anchors and an all-null projection", () => {
  const empty = testConfig();
  empty.columns = [];
  assert.equal(resolveFlowAnchors(empty), null);
  assert.deepEqual(flowTimes([event({ id: "evt-1", ts: "2026-06-01T00:00:00.000Z", type: "created", toColumn: "x" })], "S001", empty, NOW), {
    ageEntry: null, ageQualification: null, ageActivation: null, leadTime: null, cycleTime: null, finished: false,
  });
});

test("an in-progress card: stage ages from first entries, lead/cycle run to today", () => {
  const events = [
    event({ id: "evt-1", ts: "2026-01-02T00:00:00.000Z", type: "imported", toColumn: "demandes" }),
    event({ id: "evt-2", ts: "2026-03-03T00:00:00.000Z", type: "moved", fromColumn: "demandes", toColumn: "qualification" }),
    event({ id: "evt-3", ts: "2026-05-02T00:00:00.000Z", type: "moved", fromColumn: "qualification", toColumn: "actifs" }),
    // Noise that must not shift the projection: block + another card.
    event({ id: "evt-4", ts: "2026-05-10T00:00:00.000Z", type: "blocked", payload: { reason: "x" } }),
    event({ id: "evt-5", ts: "2026-02-01T00:00:00.000Z", type: "moved", cardId: "GHOST", toColumn: "done" }),
  ];
  const flow = flowTimes(events, "S001", nmoConfig(), NOW);
  assert.deepEqual(flow, {
    ageEntry: 180, ageQualification: 120, ageActivation: 60,
    leadTime: 180, cycleTime: 60, finished: false,
  });
});

test("a finished card freezes lead and cycle at the terminal entry", () => {
  const events = [
    event({ id: "evt-1", ts: "2026-01-02T00:00:00.000Z", type: "created", toColumn: "demandes" }),
    event({ id: "evt-2", ts: "2026-02-01T00:00:00.000Z", type: "moved", fromColumn: "demandes", toColumn: "actifs" }),
    event({ id: "evt-3", ts: "2026-03-03T00:00:00.000Z", type: "moved", fromColumn: "actifs", toColumn: "done" }),
  ];
  const flow = flowTimes(events, "S001", nmoConfig(), NOW);
  assert.equal(flow.finished, true);
  assert.equal(flow.leadTime, 60);
  assert.equal(flow.cycleTime, 30);
  assert.equal(flow.ageQualification, null);
});

test("entering a column after the terminal one also finishes the card", () => {
  const events = [
    event({ id: "evt-1", ts: "2026-01-02T00:00:00.000Z", type: "created", toColumn: "demandes" }),
    event({ id: "evt-2", ts: "2026-02-01T00:00:00.000Z", type: "moved", fromColumn: "demandes", toColumn: "exploitation" }),
  ];
  const flow = flowTimes(events, "S001", nmoConfig(), NOW);
  assert.equal(flow.finished, true);
  assert.equal(flow.leadTime, 30);
  assert.equal(flow.cycleTime, null);
});

test("a card never seen in the entry column falls back to its first event", () => {
  const events = [
    event({ id: "evt-1", ts: "2026-06-01T00:00:00.000Z", type: "created", toColumn: "actifs" }),
  ];
  const flow = flowTimes(events, "S001", nmoConfig(), NOW);
  assert.equal(flow.ageEntry, 30);
  assert.equal(flow.ageActivation, 30);
  assert.equal(flow.leadTime, 30);
});

test("a card with no events at all projects to all-null, unfinished", () => {
  assert.deepEqual(flowTimes([], "S001", nmoConfig(), NOW), {
    ageEntry: null, ageQualification: null, ageActivation: null, leadTime: null, cycleTime: null, finished: false,
  });
});
