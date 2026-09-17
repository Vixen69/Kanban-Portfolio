// Board snapshots (ADR 042): the summary never carries the cards, the
// restore event points at the snapshot's log position.

import { test } from "node:test";
import assert from "node:assert/strict";
import { restoreEvent, summarizeSnapshot, type BoardSnapshot } from "./snapshot.ts";
import { restoreTarget, RESTORE_CARD_ID } from "./restore.ts";
import { testCard, testConfig } from "./test-helpers.ts";

const SNAPSHOT: BoardSnapshot = {
  id: "snap-1", ts: "2026-09-17T10:00:00.000Z", actor: "pmo", label: "avant réimport", logSeq: 12, exerciseYear: 2026,
  cards: [testCard({ id: "A" }), testCard({ id: "B" })],
  capacity: [
    { exerciseYear: 2027, persons: [], assignments: [], generic: [] },
    { exerciseYear: 2026, persons: [], assignments: [], generic: [] },
  ],
  configOverride: testConfig(),
};

test("summarizeSnapshot: counts and years, never the cards", () => {
  assert.deepEqual(summarizeSnapshot(SNAPSHOT), {
    id: "snap-1", ts: "2026-09-17T10:00:00.000Z", actor: "pmo", label: "avant réimport", logSeq: 12, exerciseYear: 2026,
    cardCount: 2, capacityYears: [2026, 2027], hasOverride: true,
  });
  assert.equal(summarizeSnapshot({ ...SNAPSHOT, configOverride: null }).hasOverride, false);
});

test("restoreEvent: board-wide, pointing at the snapshot's position", () => {
  const input = restoreEvent(SNAPSHOT, "pmo", "2026-09-18T08:00:00.000Z");
  assert.equal(input.cardId, RESTORE_CARD_ID);
  assert.equal(input.type, "restored");
  assert.deepEqual(input.payload, { toSeq: 12, snapshotId: "snap-1", label: "avant réimport" });
  assert.equal(restoreTarget({ ...input, id: "evt-20" }), 12);
});
