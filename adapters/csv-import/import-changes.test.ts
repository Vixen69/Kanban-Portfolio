// The readable report built from a plan (ADR 055), over the Projets-onglet
// perimeter (no COUT PREV): a project gone from the onglet leaves « plus
// présent dans l'onglet Projets », comes back with its verdict; an
// untouched reload changes nothing; a deck the load would refuse previews
// nothing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig, Card, CardEvent } from "../../core/types.ts";
import { runImportAudit } from "./orchestrate.ts";
import type { InputFile } from "./orchestrate.ts";
import { planLoad } from "./to-cards.ts";
import { importChanges } from "./import-changes.ts";

const CONFIG = JSON.parse(readFileSync(new URL("../../config/board.json", import.meta.url), "utf8")) as BoardConfig;
const NOW = new Date("2026-09-08T09:00:00.000Z");
const PROJETS = readFileSync(new URL("../../fixtures/import/Projets.csv", import.meta.url), "utf8");

function projets(content: string): InputFile[] {
  return [{ name: "Projets.csv", bytes: new TextEncoder().encode(content) }];
}

/** A board in memory: what the storage would hold after each load. */
interface Board {
  cards: Card[];
  events: CardEvent[];
}

// Audits the files against the board, then writes the plan into it (the
// store's upsert and id assignment); returns the load's changes.
function loadInto(board: Board, files: InputFile[]) {
  const audit = runImportAudit(files, CONFIG, NOW);
  const plan = planLoad(audit.cards?.cards ?? [], CONFIG, board.cards, board.events, NOW);
  const changes = importChanges({ audit, config: CONFIG, year: 2026, plan, baseCards: board.cards, events: board.events });
  const byId = new Map(board.cards.map((card) => [card.id, card]));
  for (const card of plan.cards) byId.set(card.id, card);
  board.cards = [...byId.values()];
  board.events = [...board.events, ...plan.events.map((event, i) => ({ ...event, id: `evt-${board.events.length + i + 1}` }))];
  return changes;
}

test("ADR 055, Projets perimeter: a project leaves the onglet, then comes back — each time with its reason", () => {
  const board: Board = { cards: [], events: [] };
  const first = loadInto(board, projets(PROJETS));
  assert.deepEqual([first.perimeter.source, first.counts.created], ["Projets", 6]);
  const without = PROJETS.split(/\r?\n/).filter((line) => !line.startsWith("PE10002;")).join("\n");
  const gone = loadInto(board, projets(without));
  assert.deepEqual(gone.left.map((l) => [l.code, l.reason]), [["PE10002", "plus présent dans l’onglet Projets « Projets.csv »"]]);
  assert.deepEqual(gone.cardChanges.map((c) => [c.kind, c.codename]), [["absent", "PE10002"]]);
  const back = loadInto(board, projets(PROJETS));
  assert.deepEqual(back.back.map((l) => [l.code, l.reason]), [
    ["PE10002", "de nouveau dans le périmètre Projets — état « Nouveau », type « Etude » (l’onglet Projets fait foi)"],
  ]);
  const again = loadInto(board, projets(PROJETS));
  assert.deepEqual([again.entered, again.left, again.back, again.cardChanges], [[], [], [], []]);
  assert.equal(again.counts.updated, 6);
});

test("ADR 055: no plan (no deck) — the files and the perimeter only, nothing on the board", () => {
  const audit = runImportAudit(projets(PROJETS), CONFIG, NOW);
  const changes = importChanges({ audit, config: CONFIG, year: 2026, plan: null, baseCards: [], events: [] });
  assert.deepEqual([changes.entered, changes.left, changes.cardChanges, changes.kept], [[], [], [], []]);
  assert.equal(changes.counts.created, 0);
  assert.deepEqual([changes.perimeter.source, changes.perimeter.retained, changes.perimeter.excluded], ["Projets", 6, []]);
});
