// Snapshots (ADR 042): a take freezes cards, capacity, config and year with
// the log's position; a restore puts them back and appends one `restored`
// event the fold reads from; the routes guard their inputs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { lifecycleEvent, movedEvent } from "../core/events.ts";
import { foldEvents } from "../core/state.ts";
import { testCard, testConfig } from "../core/test-helpers.ts";
import { BadRequest } from "./errors.ts";
import { getSnapshots, postRestore, postSnapshot, restoreSnapshot, takeSnapshot } from "./snapshots.ts";
import { stubConfigStore, stubStorage } from "./test-helpers.ts";

const NOW = new Date("2026-09-17T10:00:00.000Z");

const CARD = testCard({ id: "S001", columnId: "backlog" });
const MOVE = movedEvent("S001", { laneId: CARD.laneId, columnId: "backlog" }, { laneId: CARD.laneId, columnId: "etudes" }, "a", NOW.toISOString());

function deps() {
  const defaults = testConfig();
  return { storage: stubStorage([CARD]), configStore: stubConfigStore(defaults), defaults };
}

test("takeSnapshot: the base cards, the capacity, the override, the year and the log position", async () => {
  const { storage, configStore, defaults } = deps();
  const override = { ...defaults, andonThresholdDays: 9 };
  configStore.setRuntime(override, "pmo");
  await storage.importCapacity({ exerciseYear: defaults.exercise.year, persons: [], assignments: [], generic: [] });
  await storage.appendEvent(MOVE);
  const summary = await takeSnapshot({ storage, configStore }, "avant réimport", "pmo", NOW);
  assert.equal(summary.label, "avant réimport");
  assert.equal(summary.cardCount, 1);
  assert.equal(summary.logSeq, 1);
  assert.equal(summary.exerciseYear, defaults.exercise.year);
  assert.deepEqual(summary.capacityYears, [defaults.exercise.year]);
  assert.equal(summary.hasOverride, true);
  const stored = await storage.loadSnapshot(summary.id);
  assert.deepEqual(stored?.configOverride, override);
  assert.equal(stored?.cards[0]?.id, "S001");
});

test("restoreSnapshot: cards, capacity, override and year come back; the log keeps everything and reads from the position", async () => {
  const { storage, configStore, defaults } = deps();
  const year = defaults.exercise.year;
  const taken = await takeSnapshot({ storage, configStore }, "t0", "pmo", NOW);
  // Life after the snapshot: a new card, a move, a config, a year switch.
  await storage.insertCard(testCard({ id: "S002" }), lifecycleEvent("created", "S002", "a", NOW.toISOString()));
  await storage.appendEvent(MOVE);
  configStore.setRuntime({ ...defaults, andonThresholdDays: 9 }, "pmo");
  configStore.setExerciseYear(year + 1, "pmo");
  const result = await restoreSnapshot({ storage, configStore }, taken.id, "pmo", NOW);
  assert.equal(result.event.type, "restored");
  assert.equal(result.event.cardId, "*");
  assert.deepEqual(result.event.payload, { toSeq: 0, snapshotId: taken.id, label: "t0" });
  assert.equal(result.config.exercise.year, year, "the year is back");
  assert.equal(configStore.getOverride(), null, "the override is gone: the model ran at the take");
  const cards = await storage.listBaseCards();
  assert.deepEqual(cards.map((card) => card.id), ["S001"], "the card inserted after the take is gone");
  const events = await storage.listEvents();
  assert.equal(events.length, 3, "nothing was deleted from the log");
  const board = foldEvents(cards, events);
  assert.equal(board[0]?.columnId, "backlog", "the move after the take is undone");
});

test("restoreSnapshot: an unknown id is refused", async () => {
  const { storage, configStore } = deps();
  await assert.rejects(restoreSnapshot({ storage, configStore }, "nope", "pmo", NOW), BadRequest);
  await assert.rejects(postRestore({ storage, configStore }, ""), BadRequest);
  await assert.rejects(postRestore({ storage, configStore }, undefined), BadRequest);
});

test("routes: a take needs a label; the list is newest first", async () => {
  const { storage, configStore } = deps();
  await assert.rejects(postSnapshot({ storage, configStore }, {}), BadRequest);
  await assert.rejects(postSnapshot({ storage, configStore }, { label: "   " }), BadRequest);
  const first = await postSnapshot({ storage, configStore }, { label: "  premier  " });
  assert.equal(first.status, 201);
  const second = await postSnapshot({ storage, configStore }, { label: "second" });
  const list = await getSnapshots({ storage, configStore });
  assert.equal(list.status, 200);
  const labels = (list.body as { label: string }[]).map((entry) => entry.label);
  assert.deepEqual(labels, ["second", "premier"]);
  assert.notEqual((first.body as { id: string }).id, (second.body as { id: string }).id);
});
