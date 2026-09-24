// Finished projects land in Done (ADR 043, author 2026-09-18: « les garder,
// mais en Done »): a project whose process state is a config done state
// goes to the terminal column whatever its milestones say — said in the
// report when the RDR is not approved; without `doneStates` the milestones
// alone position the cards.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { parseCsv } from "./csv.ts";
import { identifyHeader } from "./contract.ts";
import { createReport } from "./report.ts";
import { parseCouts } from "./couts.ts";
import { parseJalons } from "./jalons.ts";
import { assembleCards } from "./enrich.ts";

const CONFIG = JSON.parse(
  readFileSync(new URL("../../config/board.json", import.meta.url), "utf8"),
) as BoardConfig;
const NOW = new Date("2026-09-04T12:00:00.000Z");
const FINISHED = "MEWTBN7Q"; // « Terminé » in the Couts.csv fixture
const JALONS_HEADER = "Id;Nom du projet;Etat du processus;RDO franchi;RDO (Statut);RDLI franchi;RDLI (Statut);RDR franchi;RDR (Statut);Jalon en cours";

function perimeter(config: BoardConfig) {
  const parsed = parseCsv(readFileSync(new URL("../../fixtures/import/Couts.csv", import.meta.url), "utf8"));
  const identified = identifyHeader(parsed.rows[0]?.cells ?? []);
  if (identified.status !== "match") throw new Error("Couts.csv: header not recognized");
  return parseCouts(parsed.rows.slice(1), identified, config, createReport(), "Couts.csv");
}

function jalons(lines: string[]) {
  const parsed = parseCsv([JALONS_HEADER, ...lines].join("\n"));
  const identified = identifyHeader(parsed.rows[0]?.cells ?? []);
  if (identified.status !== "match") throw new Error("jalons: header not recognized");
  return parseJalons(parsed.rows.slice(1), identified, CONFIG, createReport(), "ProjetsJalons.csv", NOW);
}

test("the perimeter carries each project's process state", () => {
  const states = new Map(perimeter(CONFIG).entries.map((entry) => [entry.id, entry.state]));
  assert.equal(states.get(FINISHED), "Terminé");
  assert.ok([...states.values()].every((state) => CONFIG.exercise.states!.includes(state)));
});

test("a « Terminé » project lands in Done without any milestone line, positioned — the others wait in the entry column", () => {
  const report = createReport();
  const deck = assembleCards(perimeter(CONFIG), null, null, CONFIG, report)!;
  const finished = deck.cards.find((card) => card.codename === FINISHED)!;
  assert.deepEqual([finished.columnId, finished.positioned], ["done", true]);
  const others = deck.cards.filter((card) => card.codename !== FINISHED);
  assert.ok(others.every((card) => card.columnId === "demandes" && !card.positioned));
  assert.equal(deck.stats.doneByState, 1);
  assert.ok(report.warnings.some((w) => /état « Terminé » sans RDR approuvé — carte placée dans Terminé par l'état \(ADR 043\)/.test(w.message)));
});

test("the state wins over milestones that stop at RDLI, and says so; an approved RDR agrees silently", () => {
  const stopped = createReport();
  const atRdli = jalons([`${FINISHED};Étude connectivité site B;Terminé;VRAI;Approuvé;VRAI;Approuvé;FAUX;Planifié;RDR`]);
  const deck = assembleCards(perimeter(CONFIG), atRdli, null, CONFIG, stopped)!;
  assert.equal(deck.cards.find((card) => card.codename === FINISHED)!.columnId, "done");
  assert.ok(stopped.warnings.some((w) => /sans RDR approuvé/.test(w.message)));
  const agreed = createReport();
  const atRdr = jalons([`${FINISHED};Étude connectivité site B;Terminé;VRAI;Approuvé;VRAI;Approuvé;VRAI;Approuvé;`]);
  const done = assembleCards(perimeter(CONFIG), atRdr, null, CONFIG, agreed)!;
  assert.equal(done.cards.find((card) => card.codename === FINISHED)!.columnId, "done");
  assert.equal(done.stats.doneByState, 1);
  assert.ok(!agreed.warnings.some((w) => /sans RDR approuvé/.test(w.message)));
});

test("without `doneStates` the milestones alone position the cards", () => {
  const config: BoardConfig = { ...CONFIG, exercise: { year: CONFIG.exercise.year, states: CONFIG.exercise.states! } };
  const deck = assembleCards(perimeter(config), null, null, config, createReport())!;
  const finished = deck.cards.find((card) => card.codename === FINISHED)!;
  assert.deepEqual([finished.columnId, finished.positioned], ["demandes", false]);
  assert.equal(deck.stats.doneByState, 0);
});
