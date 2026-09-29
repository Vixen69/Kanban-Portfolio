// The global journal (ADR 052): what it narrates, in which words, and how
// its filters keep rows — table-driven over a small NMO-shaped log.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { BoardConfig, CardEvent } from "./types.ts";
import { testConfig } from "./test-helpers.ts";
import { journalCounts, journalRows, placeName, type JournalKind } from "./journal.ts";

function board(): BoardConfig {
  const base = testConfig();
  const column = (id: string, name: string) => ({ id, name, gate: null, review: null, gateStart: null, note: "" });
  return {
    ...base,
    columns: [column("demandes", "Demandes"), column("qualification", "Qualification"), column("etudes", "Études"), column("pause", "Pause"), column("actifs", "Actifs")],
  };
}

const ALL: ReadonlySet<JournalKind> = new Set(["move", "decision", "block", "archive", "import"]);

function ev(seq: number, cardId: string, type: CardEvent["type"], extra: Partial<CardEvent> = {}): CardEvent {
  return {
    id: `evt-${seq}`, ts: `2026-09-${String(seq).padStart(2, "0")}T10:00:00.000Z`, actor: "anonymous", cardId, type,
    fromColumn: null, toColumn: null, payload: {}, ...extra,
  };
}

function move(seq: number, cardId: string, from: [string, string], to: [string, string], actor = "anonymous"): CardEvent {
  return ev(seq, cardId, "moved", { actor, fromColumn: from[1], toColumn: to[1], payload: { fromLaneId: from[0], laneId: to[0] } });
}

const LOG: CardEvent[] = [
  ev(1, "S1", "imported", { actor: "import-csv", toColumn: "demandes", payload: { laneId: "laneA" } }),
  move(2, "S1", ["laneA", "demandes"], ["laneA", "qualification"]),
  move(3, "S1", ["laneA", "qualification"], ["laneB", "etudes"]),
  ev(4, "S1", "blocked", { payload: { reason: "Attente du sponsor" } }),
  move(5, "S1", ["laneB", "etudes"], ["laneB", "pause"]),
  ev(6, "S1", "decided", { payload: { decisionId: "D4", grounds: ["n_avance_pas"], reason: "Plus de sponsor.", reviewDate: "2026-11-02", pauseKind: "tactique" } }),
  move(7, "S1", ["laneB", "pause"], ["laneB", "pause"]),
  ev(8, "S1", "commented", { payload: { text: "vu" } }),
  move(9, "S2", ["laneA", "etudes"], ["laneA", "actifs"], "import-csv"),
  ev(10, "S2", "archived"),
];

test("journalRows: newest first, gestures in words, reorders / comments left out", () => {
  const rows = journalRows(board(), LOG, { kinds: ALL });
  assert.deepEqual(rows.map((row) => [row.id, row.kind, row.label]), [
    ["evt-10", "archive", "Archivée"],
    ["evt-9", "import", "Déplacée par l'import"],
    ["evt-6", "decision", "Mettre en pause (tactique)"],
    ["evt-5", "move", "Mise en pause"],
    ["evt-4", "block", "Bloquée"],
    ["evt-3", "move", "Qualifiée : Lane B"],
    ["evt-2", "move", "Faire entrer"],
    ["evt-1", "import", "Importée"],
  ]);
  const pause = rows.find((row) => row.id === "evt-5");
  assert.equal(pause?.from, "Études · Lane B");
  assert.equal(pause?.to, "Pause · Lane B");
  assert.equal(rows.find((row) => row.id === "evt-2")?.to, "Qualification"); // no canal before the RDO
  assert.equal(rows.find((row) => row.id === "evt-6")?.detail, "N’avance pas · réexamen 02/11/2026 · Plus de sponsor.");
  assert.equal(rows.find((row) => row.id === "evt-4")?.detail, "Attente du sponsor");
});

test("journalRows: filters by kind, log position, instant and card", () => {
  const config = board();
  const decisions = journalRows(config, LOG, { kinds: new Set(["decision"]) });
  assert.deepEqual(decisions.map((row) => row.id), ["evt-6"]);
  const sinceSnapshot = journalRows(config, LOG, { kinds: ALL, afterSeq: 5 });
  assert.deepEqual(sinceSnapshot.map((row) => row.id), ["evt-10", "evt-9", "evt-6"]);
  const sinceDay = journalRows(config, LOG, { kinds: ALL, sinceTs: "2026-09-09T00:00:00.000Z" });
  assert.deepEqual(sinceDay.map((row) => row.id), ["evt-10", "evt-9"]);
  const oneCard = journalRows(config, LOG, { kinds: ALL, cardIds: new Set(["S2"]) });
  assert.deepEqual(oneCard.map((row) => row.id), ["evt-10", "evt-9"]);
});

test("journalCounts and placeName", () => {
  const config = board();
  const counts = journalCounts(journalRows(config, LOG, { kinds: ALL }));
  assert.deepEqual(counts, { move: 3, decision: 1, block: 1, archive: 1, import: 2 });
  assert.equal(placeName(config, "laneA", "actifs"), "Actifs · Lane A");
  assert.equal(placeName(config, "laneA", "demandes"), "Demandes");
  assert.equal(placeName(config, null, "ghost"), "ghost");
});
