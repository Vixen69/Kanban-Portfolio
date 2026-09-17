// GET /api/events?after=N (ADR 040) and the per-action validation fold:
// postEvent asks the storage for the involved cards' events only.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { EventFilter } from "../core/ports.ts";
import { lifecycleEvent } from "../core/events.ts";
import { testCard, testConfig } from "../core/test-helpers.ts";
import { BadRequest, postEvent } from "./api.ts";
import { getEvents } from "./reads.ts";
import { stubStorage } from "./test-helpers.ts";

const config = testConfig();

test("getEvents: every event after the sequence; absent = all; a bad value is refused", async () => {
  const storage = stubStorage();
  await storage.appendEvent(lifecycleEvent("commented", "S001", "a", "2026-01-01T00:00:00.000Z", { text: "un" }));
  await storage.appendEvent(lifecycleEvent("commented", "S001", "a", "2026-01-02T00:00:00.000Z", { text: "deux" }));
  const all = (await getEvents(storage, undefined)).body as { events: Array<{ id: string }> };
  assert.equal(all.events.length, 2);
  const after = (await getEvents(storage, "1")).body as { events: Array<{ id: string }> };
  assert.deepEqual(after.events.map((e) => e.id), ["evt-2"]);
  const none = (await getEvents(storage, "2")).body as { events: unknown[] };
  assert.deepEqual(none.events, []);
  for (const bad of ["x", "-1", "1.5", ["1"]]) await assert.rejects(() => getEvents(storage, bad), BadRequest);
});

test("postEvent folds the involved cards only (plus the board-wide restore events, ADR 042): the storage receives their ids, not a full-log request", async () => {
  const storage = stubStorage([testCard({ id: "S001" }), testCard({ id: "S002" })]);
  const asked: EventFilter[] = [];
  const spied = {
    ...storage,
    listEvents: (filter: EventFilter = {}) => { asked.push(filter); return storage.listEvents(filter); },
  };
  const result = await postEvent(spied, config, { type: "commented", cardId: "S001", text: "bonjour" });
  assert.equal(result.status, 201);
  assert.deepEqual(asked, [{ cardIds: ["S001", "*"] }]);
  await assert.rejects(() => postEvent(spied, config, { type: "commented", cardId: "ghost", text: "x" }), /Carte inconnue/);
  assert.deepEqual(asked[1], { cardIds: ["ghost", "*"] });
});
