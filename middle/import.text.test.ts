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
import { boardText, loadText } from "../sync/import-text.ts";
import type { LoadTextInput } from "../sync/import-text.ts";

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

test("the CLI says the hand corrections replaced, the placements overtaken, the cards left in Pause and those a done state took out (ADR 060)", () => {
  const ref = { cardId: "PE10004@2026", code: "PE10004", title: "Refonte GMAO" };
  const changes: ImportChanges = {
    ...emptyChanges(),
    replaced: [{ label: "estimé k€", cards: [{ cardId: "PE10001@2026", code: "PE10001", title: "Modernisation atelier" }] }],
    advanced: [{ ...ref, fromColumn: "etudes", toColumn: "actifs" }],
    paused: [{ cardId: "PE10005@2026", code: "PE10005", title: "Archivage légal", fromColumn: "pause", toColumn: "actifs" }],
    unpaused: [{ cardId: "PE10006@2026", code: "PE10006", title: "Migration messagerie", fromColumn: "pause", toColumn: "done" }],
  };
  const text = boardText(changes, CONFIG).join("\n");
  assert.match(text, /Correction manuelle remplacée par la nouvelle valeur de l’export \(ADR 060\) :\n {2}estimé k€ \(1\) : PE10001/);
  assert.match(text, /Placement à la main dépassé par un nouveau jalon \(ADR 060\) :\n {2}PE10004 « Refonte GMAO » : Études\/Cadrage → Actifs/);
  assert.match(text, /En pause — nouveau jalon non appliqué \(ADR 060\) :\n {2}‖ PE10005 « Archivage légal » : reste en Pause \(export : Pause → Actifs\)/);
  assert.match(text, /Sortis de Pause — état Sciforma terminé \(ADR 060\) :\n {2}▸ PE10006 « Migration messagerie » : sorti de Pause : état Sciforma terminé \(Pause → Terminé\)/);
});

test("the CLI load summary: counts, the ADR 058/059/060 outcomes, the divergences with the cards in Pause said", () => {
  const plan: LoadTextInput = {
    created: 1, updated: 4, moved: 2, advanced: [{ cardId: "a", title: "A", fromColumn: "etudes", toColumn: "actifs" }],
    paused: [{ cardId: "b", title: "B", fromColumn: "pause", toColumn: "actifs" }],
    unpaused: [{ cardId: "d", title: "D", fromColumn: "pause", toColumn: "done" }],
    replaced: [{ label: "estimé k€", cardIds: ["a", "c"] }], unlisted: 1, relisted: 0, kept: 0, domainReplaced: 0, domainKept: 1,
    divergences: [{ title: "B", fromColumn: "pause", toColumn: "actifs" }, { title: "C", fromColumn: "prets", toColumn: "etudes" }],
    factsKept: [], adopted: [{ id: "S007", code: "PE10002", title: "Refonte", manualTitle: "Portail" }], deletedSkipped: ["PE10003@2026"],
    identityDoubts: ["un doute"],
  };
  const text = loadText(plan, CONFIG).join("\n");
  assert.match(text, /chargement : 1 carte\(s\) créée\(s\) · 4 relue\(s\) · 2 déplacée\(s\) par l'export \(dont 1 placée\(s\) à la main/);
  assert.match(text, /2 correction\(s\) manuelle\(s\) remplacée\(s\)/);
  assert.match(text, /adoptées \(saisies à la main\) : 1 · supprimées du tableau, ignorées : 1 · doutes d'identité : 1 · en pause, jalon non appliqué : 1 · sortie\(s\) de Pause \(état Sciforma terminé\) : 1/);
  assert.match(text, /« B » : tableau Pause \/ export Actifs — en pause — nouveau jalon non appliqué\n {2}· « C » : tableau Prêts \/ export Études\/Cadrage$/);
});
