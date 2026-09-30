// The words of the readable import screen (ADR 055): title, key numbers,
// file chips, folding of the lists, the instantané of the last load.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { ImportChangeCounts, ImportFileEntry } from "../core/import-types.ts";
import type { SnapshotSummary } from "../core/snapshot.ts";
import { fileChip, keyNumbers, lastImportSnapshot, listOpen, minorCounts, reportTitle } from "./importReport.ts";

const COUNTS: ImportChangeCounts = {
  updated: 140, created: 3, absent: 2, back: 1, moved: 4, divergences: 0, valuesChanged: 37, valuesKept: 5,
};

test("reportTitle: what the load will change, then what it changed", () => {
  assert.equal(reportTitle(false), "Ce que le chargement va changer");
  assert.equal(reportTitle(true), "Ce que le chargement a changé");
});

test("keyNumbers: the five numbers in the mockup's order", () => {
  assert.deepEqual(keyNumbers(COUNTS).map((n) => [n.value, n.label]), [
    [140, "projets mis à jour"], [3, "nouveaux"], [2, "absents de l’import (∅)"],
    [37, "valeurs changées"], [5, "gardées (absentes des fichiers)"],
  ]);
});

test("minorCounts: only the non-zero secondary counts", () => {
  assert.deepEqual(minorCounts(COUNTS), ["1 de retour", "4 déplacé(s)"]);
  assert.deepEqual(minorCounts({ ...COUNTS, back: 0, moved: 0, divergences: 2 }), [
    "2 divergence(s) laissée(s) en place (placées à la main)",
  ]);
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
