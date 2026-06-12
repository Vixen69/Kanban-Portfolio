import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryEventStore, lifecycleEvent, movedEvent } from "./events.ts";

const TS = "2026-06-01T10:00:00.000Z";

test("append assigns sequential ids and freezes events", () => {
  const store = new InMemoryEventStore();
  const first = store.append(lifecycleEvent("created", "S001", "test", TS));
  const second = store.append(lifecycleEvent("blocked", "S001", "test", TS, { reason: "x" }));
  assert.equal(first.id, "evt-1");
  assert.equal(second.id, "evt-2");
  assert.ok(Object.isFrozen(first));
  assert.equal(store.size(), 2);
});

test("the payload is copied and frozen — history cannot be rewritten", () => {
  const store = new InMemoryEventStore();
  const callerPayload: Record<string, unknown> = { reason: "attente" };
  const stored = store.append(lifecycleEvent("blocked", "S001", "test", TS, callerPayload));
  callerPayload["reason"] = "MUTATED";
  assert.equal(store.list()[0]?.payload["reason"], "attente");
  assert.ok(Object.isFrozen(stored.payload));
});

test("list returns a snapshot — mutating it does not affect the store", () => {
  const store = new InMemoryEventStore();
  store.append(lifecycleEvent("created", "S001", "test", TS));
  const snapshot = store.list();
  snapshot.pop();
  assert.equal(store.size(), 1);
  assert.equal(store.list().length, 1);
});

test("the store is append-only: no update or delete surface exists", () => {
  const store = new InMemoryEventStore() as unknown as Record<string, unknown>;
  assert.equal(store["update"], undefined);
  assert.equal(store["delete"], undefined);
  assert.equal(store["remove"], undefined);
  assert.equal(store["clear"], undefined);
});

test("subscribe notifies on append, unsubscribe stops notifications", () => {
  const store = new InMemoryEventStore();
  let calls = 0;
  const unsubscribe = store.subscribe(() => calls++);
  store.append(lifecycleEvent("created", "S001", "test", TS));
  assert.equal(calls, 1);
  unsubscribe();
  store.append(lifecycleEvent("edited", "S001", "test", TS));
  assert.equal(calls, 1);
});

test("movedEvent records columns first-class and lanes in the payload", () => {
  const input = movedEvent(
    "S042",
    { laneId: "projets", columnId: "etudes" },
    { laneId: "petits", columnId: "prets" },
    "local",
    TS,
  );
  assert.equal(input.type, "moved");
  assert.equal(input.fromColumn, "etudes");
  assert.equal(input.toColumn, "prets");
  assert.deepEqual(input.payload, { fromLane: "projets", toLane: "petits" });
  assert.equal(input.actor, "local");
  assert.equal(input.ts, TS);
});

test("lifecycleEvent leaves columns null and carries the payload", () => {
  const input = lifecycleEvent("blocked", "S042", "local", TS, { reason: "attente budget" });
  assert.equal(input.type, "blocked");
  assert.equal(input.fromColumn, null);
  assert.equal(input.toColumn, null);
  assert.deepEqual(input.payload, { reason: "attente budget" });
});
