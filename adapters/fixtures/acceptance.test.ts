// The hard acceptance criterion, executed against the REAL config/board.json:
// at 1920x1080 with the 150-card design portfolio, the full board is visible
// with zero scrolling (radiator density 16px), and the portfolio exercises
// the whole visual vocabulary (aging, blocked, andon).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateBoardConfig } from "../../core/config.ts";
import { foldEvents, toCard } from "../../core/state.ts";
import { isAndon, isStale } from "../../core/aging.ts";
import { fitsOneScreen, boardRequiredHeight } from "../../core/layout.ts";
import { InMemoryEventStore } from "../../core/events.ts";
import { createFixtures } from "./index.ts";
import { TOTAL_CARDS } from "./generate.ts";

const NOW = new Date("2026-07-06T12:00:00.000Z");
const CONFIG = validateBoardConfig(
  JSON.parse(readFileSync(new URL("../../config/board.json", import.meta.url), "utf8")),
);

function boardStates() {
  const { dataSource, seedEvents } = createFixtures(CONFIG, NOW);
  const store = new InMemoryEventStore();
  for (const input of seedEvents) store.append(input);
  const cards = dataSource.listSubjects().map((s) => toCard(s, dataSource.getFinancials(s.id)));
  return foldEvents(cards, store.list());
}

test("the fixtures portfolio holds exactly 150 cards", () => {
  assert.equal(boardStates().length, TOTAL_CARDS);
});

test("acceptance: the whole portfolio fits 1080px in radiator mode", () => {
  const states = boardStates();
  const required = boardRequiredHeight(states, CONFIG);
  assert.ok(
    fitsOneScreen(states, CONFIG, 1080),
    `hauteur requise ${required}px > 1080px`,
  );
});

test("the portfolio exercises the full visual vocabulary", () => {
  const states = boardStates();
  assert.ok(states.some((s) => isStale(s, CONFIG, NOW)), "aucun sujet stagnant");
  assert.ok(states.some((s) => s.blocked), "aucun sujet bloqué");
  assert.ok(states.some((s) => isAndon(s, CONFIG, NOW)), "aucun sujet en andon");
  for (const column of CONFIG.columns) {
    const inColumn = states.filter((s) => s.columnId === column.id);
    if (column.id === "pause") {
      assert.equal(inColumn.length, 0, "pause doit démarrer vide");
    } else {
      assert.ok(inColumn.length > 0, `colonne vide : ${column.id}`);
    }
  }
});
