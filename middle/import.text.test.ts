// The CLI's wording of the readable report (sync/import-text.ts): an
// adoption (ADR 059) merges two cards, so it is said with both titles and
// a check to make; skipped deletions and identity doubts are said too.
// (The CLI has no test directory of its own; middle tests already read
// this module.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../core/types.ts";
import type { ImportChanges } from "../core/import-types.ts";
import { importChanges, runImportAudit } from "../adapters/csv-import/index.ts";
import { boardText } from "../sync/import-text.ts";

const CONFIG = JSON.parse(readFileSync(new URL("../config/board.json", import.meta.url), "utf8")) as BoardConfig;
const NOW = new Date("2026-09-30T09:00:00.000Z");

// A report with nothing in it, to fill case by case.
function emptyChanges(): ImportChanges {
  const audit = runImportAudit([], CONFIG, NOW);
  return importChanges({ audit, config: CONFIG, year: 2026, plan: null, baseCards: [], events: [] });
}

test("the CLI names each adopted hand card with its code, both titles and its id; skipped deletions and doubts too", () => {
  const changes: ImportChanges = {
    ...emptyChanges(),
    adopted: [{ cardId: "S007", code: "PE10002", title: "Refonte portail interne", manualTitle: "Portail (saisi en séance)" }],
    deletedSkipped: [{ cardId: "PE10003@2026", code: "PE10003", title: "Montée de version calcul" }],
    identityDoubts: ["code « PE10001 » porté par 2 cartes créées à la main (S001, S002) — aucune adoptée"],
  };
  const text = boardText(changes, CONFIG).join("\n");
  assert.match(text, /Cartes saisies à la main adoptées par l’export — même code \(ADR 059\), vérifier que c’est bien le même projet :\n {2}⇄ PE10002 : « Portail \(saisi en séance\) » \(S007, saisie à la main\) → « Refonte portail interne »/);
  assert.match(text, /Supprimées du tableau, non recréées \(ADR 058\) :\n {2}✕ PE10003 « Montée de version calcul »/);
  assert.match(text, /Doutes d’identité :\n {2}⚠ code « PE10001 » porté par 2 cartes/);
});

test("nothing adopted, skipped or doubtful: no such section", () => {
  const text = boardText(emptyChanges(), CONFIG).join("\n");
  assert.doesNotMatch(text, /adoptées|non recréées|Doutes d’identité/);
});
