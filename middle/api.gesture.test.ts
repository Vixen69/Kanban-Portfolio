// Decisions by the gesture (ADR 052): a move into Pause carries « Mettre en
// pause », a change of a chosen canal carries « Requalifier » — written with
// the move, all or none; without them the move is refused.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { BoardConfig, CardEvent } from "../core/types.ts";
import { movedEvent } from "../core/events.ts";
import { testCard, testConfig } from "../core/test-helpers.ts";
import { postEvent } from "./api.ts";
import { stubStorage } from "./test-helpers.ts";

function board(): BoardConfig {
  const base = testConfig();
  const column = (id: string) => ({ id, name: id, gate: null, review: null, gateStart: null, note: "" });
  return {
    ...base,
    columns: [column("demandes"), column("qualification"), column("etudes"), column("pause"), column("actifs")],
    decisions: [...base.decisions, { id: "D5", name: "Requalifier", short: "D5", color: "#2563eb", traced: true }],
  };
}

const config = board();
const TS = "2026-09-01T10:00:00.000Z";
const PAUSE = { decisionId: "D4", grounds: ["n_avance_pas"], reason: "Plus de sponsor.", reviewDate: "2099-11-02" };

// A card in Actifs · laneA whose canal a person chose (qualification drag).
async function qualifiedCard() {
  const storage = stubStorage([testCard({ id: "S001", laneId: "laneA", columnId: "actifs" })]);
  await storage.appendEvent(movedEvent("S001", { laneId: "laneA", columnId: "qualification" }, { laneId: "laneA", columnId: "etudes" }, "anonymous", TS));
  await storage.appendEvent(movedEvent("S001", { laneId: "laneA", columnId: "etudes" }, { laneId: "laneA", columnId: "actifs" }, "anonymous", TS));
  return storage;
}

async function logOf(storage: ReturnType<typeof stubStorage>): Promise<CardEvent[]> {
  return storage.listEvents();
}

test("a move into Pause without its decision is refused, and nothing is written", async () => {
  const storage = await qualifiedCard();
  await assert.rejects(
    () => postEvent(storage, config, { type: "moved", cardId: "S001", toLaneId: "laneA", toColumnId: "pause" }),
    /Ce déplacement est une décision \(« Mettre en pause »\)/,
  );
  assert.equal((await logOf(storage)).length, 2);
});

test("a move into Pause with « Mettre en pause » writes the move and the decision together", async () => {
  const storage = await qualifiedCard();
  const result = await postEvent(storage, config, { type: "moved", cardId: "S001", toLaneId: "laneA", toColumnId: "pause", decisions: [{ ...PAUSE, pauseKind: "tactique", liftCondition: "Un sponsor nommé" }] });
  assert.equal(result.status, 201);
  const [, , moved, decided] = await logOf(storage);
  assert.equal(moved?.type, "moved");
  assert.equal(moved?.toColumn, "pause");
  assert.equal(decided?.type, "decided");
  assert.equal(decided?.ts, moved?.ts);
  assert.deepEqual(decided?.payload, { ...PAUSE, pauseKind: "tactique", liftCondition: "Un sponsor nommé" });
  assert.equal((result.body as CardEvent).type, "moved");
});

test("the pause's review date: required, except for a parking — which has none", async () => {
  const noDate = { ...PAUSE, reviewDate: null };
  const post = async (decision: Record<string, unknown>) =>
    postEvent(await qualifiedCard(), config, { type: "moved", cardId: "S001", toLaneId: "laneA", toColumnId: "pause", decisions: [decision] });
  await assert.rejects(() => post(noDate), /l’échéance du réexamen est obligatoire/);
  await assert.rejects(() => post({ ...PAUSE, pauseKind: "parking" }), /Pause parking : pas d’échéance/);
  assert.equal((await post({ ...noDate, pauseKind: "parking" })).status, 201);
  await assert.rejects(() => post({ ...PAUSE, grounds: [], reason: "" }), /la raison est obligatoire/);
});

test("changing a chosen canal needs « Requalifier » with what changed; the server records from → to", async () => {
  const storage = await qualifiedCard();
  const move = { type: "moved", cardId: "S001", toLaneId: "laneB", toColumnId: "actifs" };
  await assert.rejects(() => postEvent(storage, config, move), /« Requalifier »/);
  await assert.rejects(
    () => postEvent(storage, config, { ...move, decisions: [{ decisionId: "D5", reason: "?" }] }),
    /dire ce qui a changé/,
  );
  assert.equal((await logOf(storage)).length, 2); // refused decisions leave no move behind
  const ok = await postEvent(storage, config, { ...move, decisions: [{ decisionId: "D5", natureChange: "Devenu un produit.", architectValidated: true, fromLaneId: "ghost" }] });
  assert.equal(ok.status, 201);
  const decided = (await logOf(storage))[3];
  assert.deepEqual(decided?.payload, {
    decisionId: "D5", grounds: [], reason: "", reviewDate: null,
    natureChange: "Devenu un produit.", architectValidated: true, fromLaneId: "laneA", toLaneId: "laneB",
  });
});

test("the first correction of a canal the import set is its qualification: no decision", async () => {
  const storage = stubStorage([testCard({ id: "S001", laneId: "laneA", columnId: "actifs" })]);
  const result = await postEvent(storage, config, { type: "moved", cardId: "S001", toLaneId: "laneB", toColumnId: "actifs" });
  assert.equal(result.status, 201);
  assert.equal((await logOf(storage)).length, 1);
  // … and the next change is a requalification.
  await assert.rejects(
    () => postEvent(storage, config, { type: "moved", cardId: "S001", toLaneId: "laneA", toColumnId: "actifs" }),
    /« Requalifier »/,
  );
});

test("a decision the move does not need is refused; leaving Pause needs none", async () => {
  const storage = await qualifiedCard();
  await assert.rejects(
    () => postEvent(storage, config, { type: "moved", cardId: "S001", toLaneId: "laneA", toColumnId: "etudes", decisions: [PAUSE] }),
    /Décision inattendue pour ce déplacement : « Mettre en pause »/,
  );
  await postEvent(storage, config, { type: "moved", cardId: "S001", toLaneId: "laneA", toColumnId: "pause", decisions: [PAUSE] });
  const resumed = await postEvent(storage, config, { type: "moved", cardId: "S001", toLaneId: "laneA", toColumnId: "actifs" });
  assert.equal(resumed.status, 201);
});

test("into Pause of another canal: both decisions, three events", async () => {
  const storage = await qualifiedCard();
  const move = { type: "moved", cardId: "S001", toLaneId: "laneB", toColumnId: "pause" };
  await assert.rejects(() => postEvent(storage, config, { ...move, decisions: [PAUSE] }), /« Requalifier »/);
  await postEvent(storage, config, { ...move, decisions: [PAUSE, { decisionId: "D5", natureChange: "Plus petit." }] });
  const log = await logOf(storage);
  assert.deepEqual(log.slice(2).map((event) => [event.type, event.payload["decisionId"] ?? null]), [
    ["moved", null], ["decided", "D4"], ["decided", "D5"],
  ]);
});

test("malformed decision lists are refused", async () => {
  const storage = await qualifiedCard();
  const move = { type: "moved", cardId: "S001", toLaneId: "laneA", toColumnId: "pause" };
  await assert.rejects(() => postEvent(storage, config, { ...move, decisions: "D4" }), /Décisions du déplacement invalides/);
  await assert.rejects(() => postEvent(storage, config, { ...move, decisions: [PAUSE, PAUSE] }), /deux fois/);
  await assert.rejects(() => postEvent(storage, config, { ...move, decisions: [{ ...PAUSE, decidedOn: "2999-01-01" }] }), /dans le futur/);
});

test("no laundering through Qualification: a chosen canal changed on the way there, or while there, needs « Requalifier » (ADR 052)", async () => {
  const storage = await qualifiedCard(); // chosen canal laneA, in actifs
  await assert.rejects(
    () => postEvent(storage, config, { type: "moved", cardId: "S001", toLaneId: "laneB", toColumnId: "qualification" }),
    /« Requalifier »/,
  );
  await postEvent(storage, config, { type: "moved", cardId: "S001", toLaneId: "laneA", toColumnId: "qualification" });
  await assert.rejects(
    () => postEvent(storage, config, { type: "moved", cardId: "S001", toLaneId: "laneB", toColumnId: "qualification" }),
    /« Requalifier »/,
  );
});

test("a pause carried by a move never keeps canal lanes the client sent", async () => {
  const storage = await qualifiedCard();
  await postEvent(storage, config, {
    type: "moved", cardId: "S001", toLaneId: "laneA", toColumnId: "pause",
    decisions: [{ ...PAUSE, fromLaneId: "X".repeat(5000), toLaneId: "laneB" }],
  });
  const decided = (await logOf(storage)).at(-1);
  assert.equal(decided?.payload["fromLaneId"], undefined);
  assert.equal(decided?.payload["toLaneId"], undefined);
});
