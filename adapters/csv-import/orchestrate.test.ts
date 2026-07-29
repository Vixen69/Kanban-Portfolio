// End-to-end checks of the audit pass against the real board config:
// inventory classification, RDOM selection, encoding flags, roadmap
// entries, and determinism.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { runImportAudit } from "./orchestrate.ts";
import type { InputFile } from "./orchestrate.ts";

const CONFIG = JSON.parse(
  readFileSync(new URL("../../config/board.json", import.meta.url), "utf8"),
) as BoardConfig;

const FULL_RDOM =
  "Domaine;Nom\nIngénierie;ALPHA\nSoutien;BRAVO\nIndustrie;CHARLIE\nCorporate;DELTA\n" +
  "erp;ECHO\nPLM;FOXTROT\nINF;GOLF\nA&D;HOTEL\nCyber;INDIA\n";

function file(name: string, content: string): InputFile {
  return { name, bytes: Buffer.from(content, "utf8") };
}

test("a clean RDOM file covers the nine domains without any anomaly", () => {
  const { report, rdom } = runImportAudit([file("RDOM.csv", FULL_RDOM)], CONFIG);
  assert.equal(report.inventory.length, 1);
  assert.equal(report.inventory[0]?.status, "recognized");
  assert.equal(report.inventory[0]?.encoding, "utf-8");
  assert.equal(report.taken.length, 9);
  assert.deepEqual(report.discarded, []);
  assert.deepEqual(report.doubtful, []);
  assert.deepEqual(report.warnings, []);
  assert.equal(rdom?.namesByDomain.size, 9);
  assert.equal(report.assembly[0]?.status, "prête (9 noms, 9 domaines)");
  assert.equal(report.missingExpected.length, 3);
  assert.deepEqual(report.missingExpected.map((m) => m.name), ["SP_total", "projet", "ressources_PDC"]);
});

test("an alien-header csv is inventoried unknown, RDOM still parsed", () => {
  const { report, rdom } = runImportAudit(
    [file("RDOM.csv", FULL_RDOM), file("autre.csv", "Projet;Budget\nX;1")],
    CONFIG,
  );
  const alien = report.inventory.find((f) => f.name === "autre.csv");
  assert.equal(alien?.status, "unknown");
  assert.match(alien?.detail ?? "", /en-têtes vus : « Projet » ; « Budget »/);
  assert.notEqual(rdom, null);
});

test("two clean RDOM matches: first name wins the tie, second is doubtful", () => {
  const { report, rdom } = runImportAudit(
    [file("b.csv", FULL_RDOM), file("a.csv", "Domaine;Nom\nInfra;SOLO\n")],
    CONFIG,
  );
  assert.equal(rdom?.entries.length, 1);
  assert.equal(report.doubtful.length, 1);
  assert.equal(report.doubtful[0]?.file, "b.csv");
  assert.match(report.doubtful[0]?.question ?? "", /non retenu/);
});

test("a rich export carrying Domaine+Nom does not steal the RDOM contract", () => {
  const decoy =
    "Domaine;Nom;Type;Responsable 1;Budget\n" +
    "Portefeuille X;Projet Alpha;Achat;M. Untel;12\n" +
    "Portefeuille Y;Projet Beta;Étude;Mme Unetelle;7\n";
  const { report, rdom } = runImportAudit(
    [file("a_projets.csv", decoy), file("z_rdom.csv", FULL_RDOM)],
    CONFIG,
  );
  assert.equal(rdom?.entries.length, 9);
  assert.equal(report.taken.length, 9);
  const doubt = report.doubtful.find((d) => d.file === "a_projets.csv");
  assert.match(doubt?.question ?? "", /3 écart\(s\) d'en-têtes, contre 0 pour « z_rdom\.csv »/);
  assert.equal(report.discarded.length, 0);
});

test("a Windows-1252 file is read, flagged, and its accents decoded", () => {
  const bytes = Buffer.concat([
    Buffer.from("Domaine;Nom\nIng", "latin1"),
    Buffer.from([0xe9]),
    Buffer.from("nierie;DUPONT\n", "latin1"),
  ]);
  const { report, rdom } = runImportAudit([{ name: "RDOM.csv", bytes }], CONFIG);
  assert.equal(report.inventory[0]?.encoding, "windows-1252");
  assert.equal(rdom?.entries[0]?.domainId, "ingenierie");
  assert.ok(report.warnings.some((w) => /Windows-1252/.test(w.message)));
});

test("UTF-16 and non-csv files are inventoried and skipped", () => {
  const { report, rdom } = runImportAudit(
    [
      { name: "seize.csv", bytes: Buffer.from([0xff, 0xfe, 0x41, 0x00]) },
      file("notes.txt", "pas un csv"),
    ],
    CONFIG,
  );
  assert.equal(rdom, null);
  const statuses = new Map(report.inventory.map((f) => [f.name, f.status]));
  assert.equal(statuses.get("seize.csv"), "unsupported");
  assert.equal(statuses.get("notes.txt"), "not-csv");
});

test("empty lines above the header are skipped and flagged, file still read", () => {
  const { report, rdom } = runImportAudit(
    [file("RDOM.csv", "\n\nDomaine;Nom\nInfra;SOLO\n")],
    CONFIG,
  );
  assert.equal(report.inventory[0]?.status, "recognized");
  assert.equal(rdom?.entries.length, 1);
  assert.equal(rdom?.entries[0]?.ref.line, 4);
  assert.ok(report.warnings.some((w) => /2 ligne\(s\) vide\(s\) avant l'en-tête/.test(w.message)));
});

test("a near-miss header is inventoried and NOT parsed", () => {
  const { report, rdom } = runImportAudit([file("RDOM.csv", "Domaine\nInfra\n")], CONFIG);
  assert.equal(rdom, null);
  assert.equal(report.inventory[0]?.status, "near-miss");
  assert.match(report.inventory[0]?.detail ?? "", /colonnes manquantes : Nom/);
  assert.equal(report.taken.length, 0);
});

test("no files at all: everything is expected, assembly says waiting", () => {
  const { report, rdom } = runImportAudit([], CONFIG);
  assert.equal(rdom, null);
  assert.deepEqual(report.missingExpected.map((m) => m.name), ["RDOM", "SP_total", "projet", "ressources_PDC"]);
  assert.match(report.assembly[0]?.status ?? "", /absente/);
  assert.equal(report.assembly.length, 4);
});

test("the audit is deterministic for identical inputs", () => {
  const inputs = (): InputFile[] => [
    file("RDOM.csv", FULL_RDOM),
    file("autre.csv", "Projet;Budget\nX;1"),
  ];
  const first = runImportAudit(inputs(), CONFIG);
  const second = runImportAudit(inputs(), CONFIG);
  assert.deepEqual(second.report, first.report);
});
