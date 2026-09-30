// ADR 056 on the perimeter's source: a Coût-like file that is not THE
// Coût export refuses the load — never a silent fall back to Projets.csv;
// without any Coût-like file the Projets perimeter stays, said loudly; two
// Coût exports refuse; a stray byte no longer turns a UTF-8 Coût export
// into Windows-1252. Synthetic fixtures only.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { runImportAudit } from "./orchestrate.ts";
import type { InputFile } from "./orchestrate.ts";
import { importFiles } from "./import-files.ts";

const CONFIG = JSON.parse(readFileSync(new URL("../../config/board.json", import.meta.url), "utf8")) as BoardConfig;
const NOW = new Date("2026-09-30T12:00:00.000Z");

function fixture(name: string): InputFile {
  return { name, bytes: readFileSync(new URL(`../../fixtures/import/${name}`, import.meta.url)) };
}

const BASE = ["PARAM.csv", "Projets.csv", "ProjetsJalons.csv", "SP_2026.csv"].map(fixture);
const COUTS_TEXT = readFileSync(new URL("../../fixtures/import/Couts.csv", import.meta.url), "utf8");

test("a Coût export whose « Année » header drifted refuses the load: no Projets perimeter behind its back", () => {
  const drifted = { name: "Couts.csv", bytes: Buffer.from(COUTS_TEXT.replace(";Année;", ";Année budgétaire;"), "utf8") };
  const audit = runImportAudit([...BASE, drifted], CONFIG, NOW);
  assert.equal(audit.couts, null);
  assert.equal(audit.projets, null, "the Projets onglet is NOT the perimeter");
  assert.equal(audit.cards, null);
  assert.equal(audit.blockers.length, 1);
  assert.equal(audit.blockers[0]?.source, "couts");
  assert.match(audit.blockers[0]?.message ?? "",
    /^« Couts\.csv » ressemble à l'export Coût \(COUT PREV\) sans être reconnu \(colonne\(s\) manquante\(s\) : Année\) — .* ne bascule jamais sur l'onglet Projets\.$/);
  const couts = importFiles(audit).files.find((f) => f.source === "couts");
  assert.equal(couts?.status, "douteux");
  assert.match(couts?.consequence ?? "", /^chargement refusé — « Couts\.csv » ressemble/);
  assert.ok(audit.report.warnings.some((w) => w.file === "Projets.csv" && /non utilisé comme périmètre/.test(w.message)));
});

test("without any Coût-like file the Projets perimeter stays (ADR 030), said as a douteux", () => {
  const audit = runImportAudit(BASE, CONFIG, NOW);
  assert.equal(audit.projets?.fileName, "Projets.csv");
  assert.deepEqual(audit.blockers, []);
  assert.ok(audit.report.doubtful.some((d) => d.file === "Projets.csv" && /^périmètre lu dans l'onglet Projets : aucun export Coût/.test(d.question)));
});

test("an unreadable UTF-16 .csv with no Coût file recognized refuses the load (it may be the Coût export)", () => {
  const utf16 = { name: "Cout.csv", bytes: Buffer.from([0xff, 0xfe, 0x41, 0x00]) };
  const audit = runImportAudit([...BASE, utf16], CONFIG, NOW);
  assert.equal(audit.projets, null);
  assert.match(audit.blockers[0]?.message ?? "", /^« Cout\.csv » n'a pas pu être lu \(encodage UTF-16\)/);
  const withCouts = runImportAudit([...BASE, fixture("Couts.csv"), { ...utf16, name: "Autre.csv" }], CONFIG, NOW);
  assert.deepEqual(withCouts.blockers, [], "beside a recognized Coût export, an unreadable file refuses nothing");
});

test("two Coût exports refuse the load, whatever their names — the newest is never guessed", () => {
  const audit = runImportAudit([...BASE, fixture("Couts.csv"), { ...fixture("Couts.csv"), name: "Cout (1).csv" }], CONFIG, NOW);
  assert.equal(audit.projets, null, "no election, no fall back to Projets");
  assert.deepEqual(audit.blockers.map((b) => b.message), ["Deux fichiers Coût : « Cout (1).csv » et « Couts.csv » — n'en déposer qu'un."]);
  assert.match(audit.report.assembly[0]?.status ?? "", /^refusé — Deux fichiers Coût/);
  const couts = importFiles(audit).files.find((f) => f.source === "couts");
  assert.deepEqual([couts?.status, couts?.others], ["douteux", ["Cout (1).csv", "Couts.csv"]]);
});

test("E6.3: one stray 0x92 byte in a UTF-8 Coût export keeps it UTF-8 — the COUT perimeter holds, the byte is a douteux", () => {
  const stray = { name: "Couts.csv", bytes: Buffer.concat([Buffer.from(COUTS_TEXT, "utf8"), Buffer.from([0x92, 0x0a])]) };
  const clean = runImportAudit([...BASE, fixture("Couts.csv")], CONFIG, NOW);
  const audit = runImportAudit([...BASE, stray], CONFIG, NOW);
  assert.deepEqual(audit.blockers, []);
  assert.deepEqual(audit.couts?.entries.map((e) => e.id), clean.couts?.entries.map((e) => e.id));
  assert.equal(audit.report.inventory.find((f) => f.name === "Couts.csv")?.encoding, "utf-8");
  assert.ok(audit.report.doubtful.some((d) => d.file === "Couts.csv" && /^1 octet\(s\) invalide\(s\) dans un fichier UTF-8/.test(d.question)));
});
