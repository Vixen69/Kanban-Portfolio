// The drag hover store (ADR 051): listeners hear of a hover change once,
// never of a dragover repeating the same target — each notification is a
// cell re-render during a drag.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createDragHoverStore } from "./dragHover.ts";

test("set notifies once per real change, never for the same target", () => {
  const store = createDragHoverStore();
  let heard = 0;
  const stop = store.subscribe(() => { heard++; });
  store.set({ over: { laneId: "a", columnId: "c1" }, dropCardId: null });
  store.set({ over: { laneId: "a", columnId: "c1" }, dropCardId: null }); // a repeated dragover
  assert.equal(heard, 1);
  store.set({ dropCardId: "S1" });
  store.set({ dropCardId: "S1" });
  assert.equal(heard, 2);
  assert.deepEqual(store.get(), { over: { laneId: "a", columnId: "c1" }, dropCardId: "S1" });
  store.set({ over: { laneId: "b", columnId: "c1" } });
  assert.equal(heard, 3);
  stop();
  store.set({ over: null, dropCardId: null });
  assert.equal(heard, 3); // unsubscribed
});

test("the clear at drop or drag end notifies, then stays quiet", () => {
  const store = createDragHoverStore();
  let heard = 0;
  store.subscribe(() => { heard++; });
  store.set({ over: { laneId: "a", columnId: "c1" }, dropCardId: "S2" });
  store.set({ over: null, dropCardId: null });
  store.set({ over: null, dropCardId: null });
  assert.equal(heard, 2);
  assert.deepEqual(store.get(), { over: null, dropCardId: null });
});

test("an equal hover keeps the same state object (useSyncExternalStore reads it)", () => {
  const store = createDragHoverStore();
  store.set({ over: { laneId: "a", columnId: "c1" } });
  const before = store.get();
  store.set({ over: { laneId: "a", columnId: "c1" } });
  assert.equal(store.get(), before);
});
