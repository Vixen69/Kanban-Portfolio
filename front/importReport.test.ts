// The words of the readable import screen (ADR 055): title, key numbers,
// file chips, folding of the lists, the instantané of the last load.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { ImportChangeCounts, ImportFileEntry, ImportLoadResult } from "../core/import-types.ts";
import type { SnapshotSummary } from "../core/snapshot.ts";
import { testConfig } from "../core/test-helpers.ts";
import {
  adoptedReason, advancedReason, fileChip, keyNumbers, lastImportSnapshot, listOpen, loadOutcomes, minorCounts, noImportSnapshotNote,
  noPerimeterLine, reportTitle, unloadableLine, UPDATED_HINT, warnLines,
} from "./importReport.ts";

const COUNTS: ImportChangeCounts = {
  updated: 140, created: 3, absent: 2, back: 1, moved: 4, divergences: 0, valuesChanged: 37, valuesKept: 5,
};

test("reportTitle: what the load will change, then what it changed", () => {
  assert.equal(reportTitle(false), "Ce que le chargement va changer");
  assert.equal(reportTitle(true), "Ce que le chargement a changé");
});

test("keyNumbers: the five numbers in the mockup's order", () => {
  assert.deepEqual(keyNumbers(COUNTS).map((n) => [n.value, n.label]), [
    [140, "projets relus"], [3, "nouveaux"], [2, "absents de l’import (∅)"],
    [37, "projets modifiés"], [5, "projets aux valeurs gardées (absentes des fichiers)"],
  ]);
  // « relus » counts the re-read cards (author, 2026-09-30: « mis à jour » promised a change); the tooltip keeps saying so.
  assert.equal(keyNumbers(COUNTS)[0]?.hint, UPDATED_HINT);
  assert.deepEqual(keyNumbers(COUNTS).slice(1).map((n) => n.hint), [undefined, undefined, undefined, undefined]);
});

const REF = { cardId: "c1", code: "PE1", title: "Projet" };
const LISTS = { adopted: [], deletedSkipped: [] };

test("minorCounts: only the non-zero secondary counts", () => {
  assert.deepEqual(minorCounts({ counts: COUNTS, ...LISTS }), ["1 de retour", "4 déplacé(s)"]);
  assert.deepEqual(minorCounts({ counts: { ...COUNTS, back: 0, moved: 0, divergences: 2 }, ...LISTS }), [
    "2 divergence(s) laissée(s) en place (placées à la main ou en pause)",
  ]);
});

test("minorCounts: hand placements overtaken, adoptions, deleted cards ignored (ADR 058/059/060)", () => {
  const counts = { ...COUNTS, back: 0, advanced: 2, replaced: 3 };
  const lists = { adopted: [{ ...REF, manualTitle: "Projet" }], deletedSkipped: [REF, { ...REF, cardId: "c2" }] };
  assert.deepEqual(minorCounts({ counts, ...lists }), [
    "4 déplacé(s) dont 2 placé(s) à la main, dépassé(s) par un nouveau jalon",
    "1 carte(s) saisie(s) à la main adoptée(s)",
    "2 supprimée(s) du tableau, ignorée(s)",
  ]);
  // A report made before ADR 060 carries no advanced count.
  assert.deepEqual(minorCounts({ counts: { ...COUNTS, back: 0 }, ...LISTS }), ["4 déplacé(s)"]);
});

test("warnLines: the hand corrections replaced and the identity doubts, never hidden among the minor counts", () => {
  const cases: Array<[Partial<ImportChangeCounts>, string[], boolean, string[]]> = [
    [{}, [], false, []],
    [{ replaced: 0 }, [], false, []],
    [{ replaced: 3 }, [], false, ["3 projet(s) : une correction faite à la main sera remplacée par la nouvelle valeur de l’export — voir la liste."]],
    [{ replaced: 1 }, [], true, ["1 projet(s) : une correction faite à la main a été remplacée par la nouvelle valeur de l’export — voir la liste."]],
    [{}, ["a", "b"], false, ["2 doute(s) d’identité à vérifier — voir la liste."]],
  ];
  for (const [over, doubts, loaded, expected] of cases) {
    assert.deepEqual(warnLines({ counts: { ...COUNTS, ...over }, identityDoubts: doubts }, loaded), expected);
  }
});

test("unloadableLine: the refusals themselves (ADR 056), else the missing perimeter", () => {
  const sp = "Deux fichiers SP : « SP copie.csv » et « SP_2026.csv » — n'en déposer qu'un.";
  assert.equal(unloadableLine({ blockers: [sp] }), `Chargement refusé, rien ne serait écrit : ${sp}`);
  assert.equal(unloadableLine({ blockers: ["A.", "B."] }), "Chargement refusé, rien ne serait écrit : A. B.");
  const none = "Périmètre non assemblé : le chargement est impossible, rien ne serait écrit.";
  assert.equal(unloadableLine({ blockers: [] }), none);
  assert.equal(unloadableLine({}), none, "a report made before the field");
});

test("noPerimeterLine: a refused perimeter export is not « aucun fichier »", () => {
  const refused = entry({ source: "couts", status: "douteux", consequence: "chargement refusé — Deux fichiers Coût …" });
  assert.equal(noPerimeterLine([refused]), "Périmètre non lu : l’export Coût est refusé (voir ci-dessus).");
  assert.equal(noPerimeterLine([entry({ source: "projets", status: "douteux", consequence: "chargement refusé — x" })]),
    "Périmètre non lu : l’export Projets est refusé (voir ci-dessus).");
  const spOnly = entry({ source: "sp", status: "douteux", consequence: "chargement refusé — Deux fichiers SP" });
  assert.equal(noPerimeterLine([spOnly, entry({ source: "couts" })]), "Aucun fichier de périmètre : rien ne peut être chargé.");
});

test("adoptedReason and advancedReason: the typed title, the columns by name", () => {
  assert.equal(adoptedReason({ ...REF, manualTitle: "Projet" }), "saisie à la main, même nom");
  assert.equal(adoptedReason({ ...REF, manualTitle: "Projet (brouillon)" }), "saisie à la main sous « Projet (brouillon) »");
  const config = testConfig();
  assert.equal(advancedReason(config, { ...REF, fromColumn: "col1", toColumn: "col3" }), "Colonne 1 → Colonne 3");
  assert.equal(advancedReason(config, { ...REF, fromColumn: "ghost", toColumn: "col2" }), "ghost → Colonne 2");
});

test("loadOutcomes: what the load did beyond the summary, the non-zero ones only", () => {
  const load: ImportLoadResult["load"] = {
    created: 0, updated: 0, moved: 0, unlisted: 0, relisted: 0, divergences: 0, kept: 0, chargesWithoutProfile: 0,
    domainReplaced: 0, domainKept: 0, domainKeptByPrior: 0, deletedSkipped: 0, adopted: 0, replaced: 0, advanced: 0, capacity: null,
  };
  assert.deepEqual(loadOutcomes(load), []);
  assert.deepEqual(loadOutcomes({ ...load, replaced: 2, advanced: 1, paused: 5, adopted: 3, deletedSkipped: 4 }), [
    "2 correction(s) manuelle(s) remplacée(s) par l’export",
    "1 placement(s) à la main dépassé(s) par un nouveau jalon",
    "5 en pause, nouveau jalon non appliqué",
    "3 carte(s) saisie(s) à la main adoptée(s)",
    "4 supprimée(s) du tableau, ignorée(s)",
  ]);
});

test("noImportSnapshotNote: no claim on how the exercise was loaded", () => {
  assert.equal(noImportSnapshotNote(2026), "Aucun instantané « avant chargement 2026 » : aucun chargement de l’exercice 2026 n’en a laissé à comparer.");
});

function entry(over: Partial<ImportFileEntry>): ImportFileEntry {
  return { source: "cdp", label: "ProjetsCdP", file: null, status: "absent", consequence: "chefs de projet gardés", others: [], ...over };
}

test("fileChip: taken, missing with its consequence, optional, near miss", () => {
  const cases: Array<[Partial<ImportFileEntry>, string, string]> = [
    [{ source: "couts", status: "pris", file: "cout.csv", consequence: null }, "ok", "✓ Coût"],
    [{}, "warn", "ProjetsCdP absent → chefs de projet gardés"],
    [{ source: "profils", consequence: "facultatif — rien ne change" }, "muted", "Ress.Profils absent (facultatif)"],
    [{ source: "projets", consequence: "aucun périmètre — chargement impossible" }, "warn", "Projets absent → aucun périmètre — chargement impossible"],
    [{ source: "sp", status: "douteux", consequence: "budgets gardés — « sp.csv » y ressemble mais n’a pas été lu" }, "warn", "SP douteux → budgets gardés"],
    [{ consequence: null }, "warn", "ProjetsCdP absent"],
  ];
  for (const [over, tone, text] of cases) {
    const chip = fileChip(entry(over));
    assert.equal(chip.tone, tone, text);
    assert.equal(chip.text, text);
  }
});

test("fileChip: the detail keeps the file, the whole consequence and the files not read", () => {
  const taken = fileChip(entry({ status: "pris", file: "cdp.csv", consequence: "chefs de projet lus dans un export Projets", others: ["cdp2.csv"] }));
  assert.equal(taken.detail, "ProjetsCdP ← cdp.csv — chefs de projet lus dans un export Projets (non lu : cdp2.csv)");
  const near = fileChip(entry({ status: "douteux", consequence: "chefs de projet gardés — « x.csv » y ressemble", others: ["x.csv", "y.csv"] }));
  assert.equal(near.detail, "ProjetsCdP — chefs de projet gardés — « x.csv » y ressemble (non lus : x.csv, y.csv)");
});

test("listOpen: short lists unfold, empty and long ones stay folded", () => {
  const cases: Array<[number, boolean]> = [[0, false], [1, true], [10, true], [11, false]];
  for (const [rows, open] of cases) assert.equal(listOpen(rows), open, String(rows));
});

function snap(id: string, label: string, ts: string): SnapshotSummary {
  return { id, ts, actor: "import", label, logSeq: 1, exerciseYear: 2026, cardCount: 1, capacityYears: [], hasOverride: false };
}

test("lastImportSnapshot: the newest « avant chargement <year> », any order", () => {
  const list = [
    snap("a", "avant chargement 2026", "2026-09-20T10:00:00.000Z"),
    snap("b", "avant chargement 2027", "2026-09-29T10:00:00.000Z"),
    snap("c", "avant chargement 2026", "2026-09-28T10:00:00.000Z"),
    snap("d", "avant le réimport", "2026-09-30T10:00:00.000Z"),
  ];
  assert.equal(lastImportSnapshot(list, 2026)?.id, "c");
  assert.equal(lastImportSnapshot(list, 2027)?.id, "b");
  assert.equal(lastImportSnapshot(list, 2028), null);
});
