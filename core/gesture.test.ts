// Decisions by the gesture (ADR 052): which moves are decisions, and when a
// canal counts as chosen — table-driven over the NMO-shaped test board.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { BoardConfig, CardEvent } from "./types.ts";
import { testConfig } from "./test-helpers.ts";
import { gestureTrail, IMPORT_ACTOR, laneChosen, readGesture, requiredDecisions } from "./gesture.ts";

// Intake (demandes), qualification (no canal, ADR 039), then canal columns
// with a Pause stage — and the referential's D4 / D5.
function board(): BoardConfig {
  const base = testConfig();
  const column = (id: string) => ({ id, name: id, gate: null, review: null, gateStart: null, note: "" });
  return {
    ...base,
    columns: [column("demandes"), column("qualification"), column("etudes"), column("pause"), column("actifs")],
    decisions: [
      ...base.decisions,
      { id: "D5", name: "Requalifier", short: "D5", color: "#2563eb", traced: true },
    ],
  };
}

const A = "laneA";
const B = "laneB";

test("readGesture: the stage and canal sides of every kind of move", () => {
  const config = board();
  const rows: Array<[string, [string, string], [string, string], boolean, string, string]> = [
    ["same cell", [A, "etudes"], [A, "etudes"], true, "reorder", "none"],
    ["leaves the intake", [A, "demandes"], [A, "qualification"], false, "entry", "none"],
    ["qualification drag, canal kept", [A, "qualification"], [A, "etudes"], false, "move", "qualification"],
    ["qualification drag, canal picked", [A, "qualification"], [B, "etudes"], false, "move", "qualification"],
    ["back into its known canal", [A, "qualification"], [A, "etudes"], true, "move", "none"],
    ["out of Qualification into another canal", [A, "qualification"], [B, "etudes"], true, "move", "requalification"],
    ["import default corrected", [A, "etudes"], [B, "etudes"], false, "move", "qualification"],
    ["chosen canal changed", [A, "etudes"], [B, "actifs"], true, "move", "requalification"],
    ["onward, same canal", [A, "etudes"], [A, "actifs"], true, "move", "none"],
    ["into Pause", [A, "actifs"], [A, "pause"], true, "pause", "none"],
    ["into Pause of another canal", [A, "actifs"], [B, "pause"], true, "pause", "requalification"],
    ["out of Pause", [A, "pause"], [A, "actifs"], true, "resume", "none"],
    ["back to the intake", [A, "etudes"], [A, "demandes"], true, "move", "none"],
    ["chosen canal changed on the way back to Qualification", [A, "etudes"], [B, "qualification"], true, "move", "requalification"],
    ["canal changed while in Qualification", [A, "qualification"], [B, "qualification"], true, "move", "requalification"],
    ["import default changed in Qualification", [A, "qualification"], [B, "qualification"], false, "move", "none"],
  ];
  for (const [label, [fromLane, fromColumn], [toLane, toColumn], chosen, stage, canal] of rows) {
    const gesture = readGesture(config, { laneId: fromLane, columnId: fromColumn }, { laneId: toLane, columnId: toColumn }, chosen);
    assert.deepEqual(gesture, { stage, canal }, label);
  }
});

test("requiredDecisions: pause needs D4, a requalification D5, both when both", () => {
  const config = board();
  assert.deepEqual(requiredDecisions(config, { stage: "pause", canal: "none" }), ["D4"]);
  assert.deepEqual(requiredDecisions(config, { stage: "move", canal: "requalification" }), ["D5"]);
  assert.deepEqual(requiredDecisions(config, { stage: "pause", canal: "requalification" }), ["D4", "D5"]);
  assert.deepEqual(requiredDecisions(config, { stage: "entry", canal: "none" }), []);
  assert.deepEqual(requiredDecisions(config, { stage: "move", canal: "qualification" }), []);
  assert.deepEqual(requiredDecisions(config, { stage: "resume", canal: "none" }), []);
  // A config without D5 asks for nothing it cannot record.
  const noD5 = { ...config, decisions: config.decisions.filter((d) => d.id !== "D5") };
  assert.deepEqual(requiredDecisions(noD5, { stage: "pause", canal: "requalification" }), ["D4"]);
});

function moved(id: number, cardId: string, from: [string, string], to: [string, string], actor = "anonymous"): CardEvent {
  return {
    id: `evt-${id}`, ts: `2026-09-0${id}T10:00:00.000Z`, actor, cardId, type: "moved",
    fromColumn: from[1], toColumn: to[1], payload: { fromLaneId: from[0], laneId: to[0] },
  };
}

test("laneChosen: only a hand move that qualified or changed the canal chooses it", () => {
  const config = board();
  assert.equal(laneChosen(config, "S1", []), false);
  // The import moves a card between canals: nothing chosen.
  assert.equal(laneChosen(config, "S1", [moved(1, "S1", [A, "etudes"], [B, "actifs"], IMPORT_ACTOR)]), false);
  // A hand move onward in the same canal: nothing chosen either.
  assert.equal(laneChosen(config, "S1", [moved(1, "S1", [A, "etudes"], [A, "actifs"])]), false);
  // The qualification drag chooses it, even keeping the default canal.
  assert.equal(laneChosen(config, "S1", [moved(1, "S1", [A, "qualification"], [A, "etudes"])]), true);
  // The first hand correction of an imported canal chooses it.
  assert.equal(laneChosen(config, "S1", [moved(1, "S1", [A, "etudes"], [B, "etudes"])]), true);
  // Another card's moves never count.
  assert.equal(laneChosen(config, "S1", [moved(1, "S2", [A, "qualification"], [A, "etudes"])]), false);
});

test("gestureTrail: the log read in order — first canal choice, then a requalification", () => {
  const config = board();
  const events = [
    moved(1, "S1", [A, "demandes"], [A, "qualification"]),
    moved(2, "S1", [A, "qualification"], [B, "etudes"]),
    moved(3, "S1", [B, "etudes"], [A, "etudes"]),
    moved(4, "S1", [A, "etudes"], [A, "pause"]),
    moved(5, "S1", [A, "pause"], [A, "actifs"]),
  ];
  const trail = gestureTrail(config, events);
  assert.deepEqual(trail.get("evt-1"), { stage: "entry", canal: "none" });
  assert.deepEqual(trail.get("evt-2"), { stage: "move", canal: "qualification" });
  assert.deepEqual(trail.get("evt-3"), { stage: "move", canal: "requalification" });
  assert.deepEqual(trail.get("evt-4"), { stage: "pause", canal: "none" });
  assert.deepEqual(trail.get("evt-5"), { stage: "resume", canal: "none" });
});

test("gestureTrail: an old move without fromLaneId reads as the canal unchanged", () => {
  const config = board();
  const legacy: CardEvent = { ...moved(1, "S1", [A, "etudes"], [A, "actifs"]), payload: { laneId: A } };
  assert.deepEqual(gestureTrail(config, [legacy]).get("evt-1"), { stage: "move", canal: "none" });
});
