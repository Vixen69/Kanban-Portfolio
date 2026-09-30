// The files part of the readable report (ADR 055): each expected source
// taken, missing (with what the load keeps instead), doubtful (a near
// miss not read) or set aside (an old format); unknown files named.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { runImportAudit } from "./orchestrate.ts";
import type { InputFile } from "./orchestrate.ts";
import { importFiles } from "./import-files.ts";

const CONFIG = JSON.parse(readFileSync(new URL("../../config/board.json", import.meta.url), "utf8")) as BoardConfig;
const NOW = new Date("2026-09-08T09:00:00.000Z");

function fixture(name: string): InputFile {
  return { name, bytes: readFileSync(new URL(`../../fixtures/import/${name}`, import.meta.url)) };
}

function text(name: string, content: string): InputFile {
  return { name, bytes: new TextEncoder().encode(content) };
}

test("ADR 055: a near miss is « douteux », an old format « écarté », a missing source says what the load keeps", () => {
  const files = [
    fixture("Couts.csv"), fixture("ProjetsJalons.csv"),
    text("SP_casse.csv", "Nom;Coût prév (ME);Coût réel\nProjet;10;5\n"),
    text("RDOM.csv", "Domaine;Nom\nINFRA;Projet\n"),
    text("notes.csv", "Bonjour;Monde\n1;2\n"),
  ];
  const { files: entries, unrecognized } = importFiles(runImportAudit(files, CONFIG, NOW));
  const bySource = new Map(entries.map((e) => [e.source, e]));
  assert.deepEqual(entries.map((e) => e.source), ["couts", "param", "projets", "cdp", "jalons", "sp", "pdc", "profils"]);
  assert.deepEqual([bySource.get("couts")?.status, bySource.get("couts")?.file], ["pris", "Couts.csv"]);
  assert.deepEqual([bySource.get("sp")?.status, bySource.get("sp")?.file, bySource.get("sp")?.others], ["douteux", null, ["SP_casse.csv"]]);
  assert.match(bySource.get("sp")?.consequence ?? "", /^budgets gardés .* « SP_casse\.csv » y ressemble mais n’a pas été lu/);
  assert.equal(bySource.get("param")?.status, "écarté");
  assert.match(bySource.get("param")?.consequence ?? "", /« RDOM\.csv » : table RDOM de juillet/);
  assert.deepEqual([bySource.get("cdp")?.status, bySource.get("cdp")?.consequence], ["absent", "chefs de projet gardés"]);
  assert.deepEqual([bySource.get("pdc")?.status, bySource.get("pdc")?.consequence], ["absent", "plan de charge et capacité gardés"]);
  assert.equal(bySource.get("projets")?.consequence, "facultatif — le périmètre est COUT PREV (pas de recoupement)");
  assert.deepEqual(unrecognized.map((u) => u.file), ["notes.csv"]);
});

test("ADR 055: without any perimeter file, both perimeter sources say the load is impossible", () => {
  const { files } = importFiles(runImportAudit([fixture("PARAM.csv")], CONFIG, NOW));
  const consequence = (source: string): string | null | undefined => files.find((f) => f.source === source)?.consequence;
  assert.equal(consequence("couts"), "aucun périmètre — chargement impossible");
  assert.equal(consequence("projets"), "aucun périmètre — chargement impossible");
  assert.equal(files.find((f) => f.source === "param")?.status, "pris");
});

test("without COUT PREV, the chip says the perimeter comes from the Projets onglet, in the PMO's words (no ADR number)", () => {
  const { files } = importFiles(runImportAudit([fixture("PARAM.csv"), fixture("Projets.csv")], CONFIG, NOW));
  const couts = files.find((f) => f.source === "couts");
  assert.deepEqual([couts?.status, couts?.consequence], ["absent", "périmètre lu dans l’onglet Projets"]);
});
