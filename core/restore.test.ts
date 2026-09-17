// The restore filter (ADR 042): a `restored` event undoes what was written
// between the snapshot's position and itself, restores nest, an invalid
// target is a no-op, and the fold reads the log through it.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent } from "./types.ts";
import { effectiveEvents, restoreTarget, undoneEvents, RESTORE_CARD_ID } from "./restore.ts";
import { foldEvents } from "./state.ts";
import { testCard } from "./test-helpers.ts";

const TS = "2026-09-17T10:00:00.000Z";

function moved(seq: number, cardId: string, to: string): CardEvent {
  return { id: `evt-${seq}`, ts: TS, actor: "a", cardId, type: "moved", fromColumn: "backlog", toColumn: to, payload: {} };
}

function restored(seq: number, toSeq: unknown): CardEvent {
  return { id: `evt-${seq}`, ts: TS, actor: "a", cardId: RESTORE_CARD_ID, type: "restored", fromColumn: null, toColumn: null, payload: { toSeq } };
}

const ids = (events: CardEvent[]) => events.map((event) => event.id);

test("effectiveEvents: no restore = the log as given", () => {
  const log = [moved(1, "A", "c1"), moved(2, "B", "c2")];
  assert.deepEqual(ids(effectiveEvents(log)), ["evt-1", "evt-2"]);
});

test("effectiveEvents: a restore drops what came between the target and itself, keeps what follows", () => {
  const log = [moved(1, "A", "c1"), moved(2, "A", "c2"), moved(3, "A", "c3"), restored(4, 1), moved(5, "A", "c5")];
  assert.deepEqual(ids(effectiveEvents(log)), ["evt-1", "evt-5"]);
  assert.deepEqual(ids(undoneEvents(log)), ["evt-2", "evt-3"]);
  assert.deepEqual(ids(effectiveEvents(effectiveEvents(log))), ["evt-1", "evt-5"], "idempotent");
});

test("effectiveEvents: restores nest — going back to a position reached by a restore reads it the same way", () => {
  const log = [
    moved(1, "A", "c1"), moved(2, "A", "c2"), moved(3, "A", "c3"), restored(4, 1), moved(5, "A", "c5"),
    moved(6, "A", "c6"), restored(7, 5), moved(8, "A", "c8"),
  ];
  assert.deepEqual(ids(effectiveEvents(log)), ["evt-1", "evt-5", "evt-8"]);
  assert.deepEqual(ids(undoneEvents(log)), ["evt-2", "evt-3", "evt-6"]);
});

test("effectiveEvents: a restore to a position before an earlier restore's target undoes both stretches", () => {
  const log = [moved(1, "A", "c1"), moved(2, "A", "c2"), restored(3, 1), moved(4, "A", "c4"), restored(5, 0), moved(6, "A", "c6")];
  assert.deepEqual(ids(effectiveEvents(log)), ["evt-6"]);
});

test("restoreTarget: only an integer position before the event itself counts", () => {
  assert.equal(restoreTarget(restored(4, 1)), 1);
  assert.equal(restoreTarget(restored(4, 0)), 0);
  assert.equal(restoreTarget(restored(4, 4)), null, "not before itself");
  assert.equal(restoreTarget(restored(4, 9)), null, "in the future");
  assert.equal(restoreTarget(restored(4, -1)), null);
  assert.equal(restoreTarget(restored(4, 1.5)), null);
  assert.equal(restoreTarget(restored(4, "1")), null);
  assert.equal(restoreTarget(moved(4, "A", "c1")), null);
  const log = [moved(1, "A", "c1"), restored(2, 7), moved(3, "A", "c3")];
  assert.deepEqual(ids(effectiveEvents(log)), ["evt-1", "evt-3"], "an invalid restore is a no-op, and dropped");
  assert.deepEqual(undoneEvents(log), []);
});

test("foldEvents reads the log through the restore filter", () => {
  const card = testCard({ id: "A", columnId: "backlog" });
  const log = [moved(1, "A", "c1"), moved(2, "A", "c2"), restored(3, 1)];
  const [state] = foldEvents([card], log);
  assert.equal(state!.columnId, "c1");
  const [again] = foldEvents([card], [...log, moved(4, "A", "c4")]);
  assert.equal(again!.columnId, "c4");
});
