// End-to-end checks of the audit pass against the real board config:
// inventory classification, per-contract election, header search under a
// preamble, encoding flags, roadmap entries, and determinism.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { runImportAudit } from "./orchestrate.ts";
import type { InputFile } from "./orchestrate.ts";

const CONFIG = JSON.parse(
  readFileSync(new URL("../../config/board.json", import.meta.url), "utf8"),
) as BoardConfig;

const NOW = new Date("2026-07-29T12:00:00.000Z");

const FULL_RDOM =
  "Domaine;Nom\nIngénierie;ALPHA\nSoutien;BRAVO\nIndustrie;CHARLIE\nCorporate;DELTA\n" +
  "erp;ECHO\nPLM;FOXTROT\nINF;GOLF\nA&D;HOTEL\nCyber;INDIA\n";

// The real SP_total layout: filter preamble, then the 23 real columns.
const SP_PREAMBLE =
  ";;;Afficher les montants calculés pour :;;Toute période;;;;;Afficher les lignes sans montants :;;;FAUX;;;;;;;;;";
const SP_HEADER =
  "Notes;Menu;Nom;Type;Score criblage;Priorité;Top projet;Responsable 1;État suivant autorisé;" +
  "Catégorie;Début;Jalon RVSR ou Fin;Jalon RDLI validé;Jalon RDR validé (Réf.8);Jalon RDR prévisionnel;" +
  "Budget présenté PDSI;* Budget validé RDLI;* CAT global projet;Coût prév (ME);Coût réel;ME Achats;" +
  "Engagé Achats;Réel Achats";
const SP_ROWS =
  ";;PE20001 Sujet Un;Achat;;;;;;;01/01/2026;;15/02/2026;;;;100;;80;20;;10;\n" +
  ";;Sujet Deux;;;;;;;;;;;;;;;;;;;;\n";
const FULL_SP = `${SP_PREAMBLE}\n${SP_HEADER}\n${SP_ROWS}`;

function file(name: string, content: string): InputFile {
  return { name, bytes: Buffer.from(content, "utf8") };
}

function audit(files: InputFile[]) {
  return runImportAudit(files, CONFIG, NOW);
}

test("a clean RDOM file covers the nine domains without any anomaly", () => {
  const { report, rdom } = audit([file("RDOM.csv", FULL_RDOM)]);
  assert.equal(report.inventory.length, 1);
  assert.equal(report.inventory[0]?.status, "recognized");
  assert.equal(report.inventory[0]?.encoding, "utf-8");
  assert.equal(report.taken.length, 9);
  assert.deepEqual(report.discarded, []);
  assert.deepEqual(report.doubtful, []);
  assert.deepEqual(report.warnings, []);
  assert.equal(rdom?.namesByDomain.size, 9);
  assert.equal(report.assembly[0]?.status, "prête (9 noms, 9 domaines)");
  assert.deepEqual(report.missingExpected.map((m) => m.name), ["SP_total", "projet", "ressources_PDC"]);
});

test("SP_total: preamble skipped, ignored columns listed, cards distributed", () => {
  const { report, spTotal } = audit([file("SP_total.csv", FULL_SP)]);
  assert.equal(report.inventory[0]?.status, "recognized");
  assert.ok(report.warnings.some((w) => /en-têtes reconnus ligne 2 — 1 ligne\(s\) ignorée\(s\) au-dessus/.test(w.message)));
  const ignored = report.warnings.find((w) => /colonnes ignorées \(prévues au contrat\)/.test(w.message));
  assert.match(ignored?.message ?? "", /Notes ; Menu ; Score criblage/);
  assert.equal(spTotal?.drafts.length, 2);
  assert.equal(spTotal?.drafts[0]?.codename, "PE20001");
  assert.equal(spTotal?.drafts[0]?.columnId, "actifs");
  assert.equal(spTotal?.drafts[1]?.columnId, "demandes");
  const cartes = report.assembly.find((a) => a.subject === "cartes");
  assert.equal(cartes?.status, "2 prête(s) — répartition : Demandes 1 · Actifs 1");
  assert.deepEqual(report.missingExpected.map((m) => m.name), ["RDOM", "projet", "ressources_PDC"]);
});

test("an alien-header csv is inventoried unknown, RDOM still parsed", () => {
  const { report, rdom } = audit(
    [file("RDOM.csv", FULL_RDOM), file("autre.csv", "Projet;Budget\nX;1")],
  );
  const alien = report.inventory.find((f) => f.name === "autre.csv");
  assert.equal(alien?.status, "unknown");
  assert.match(alien?.detail ?? "", /en-têtes vus : « Projet » ; « Budget »/);
  assert.notEqual(rdom, null);
});

test("two clean RDOM matches: first name wins the tie, second is doubtful", () => {
  const { report, rdom } = audit(
    [file("b.csv", FULL_RDOM), file("a.csv", "Domaine;Nom\nInfra;SOLO\n")],
  );
  assert.equal(rdom?.entries.length, 1);
  assert.equal(report.doubtful.length, 1);
  assert.equal(report.doubtful[0]?.file, "b.csv");
  assert.match(report.doubtful[0]?.question ?? "", /non retenu/);
});

test("a rich export carrying Domaine+Nom does not steal the RDOM contract", () => {
  const decoy =
    "Domaine;Nom;Colonne A;Responsable 1;Budget\n" +
    "Portefeuille X;Projet Alpha;a;M. Untel;12\n" +
    "Portefeuille Y;Projet Beta;b;Mme Unetelle;7\n";
  const { report, rdom } = audit(
    [file("a_projets.csv", decoy), file("z_rdom.csv", FULL_RDOM)],
  );
  assert.equal(rdom?.entries.length, 9);
  assert.equal(report.taken.length, 9);
  const doubt = report.doubtful.find((d) => d.file === "a_projets.csv");
  assert.match(doubt?.question ?? "", /écart\(s\) d'en-têtes, contre 0 pour « z_rdom\.csv »/);
  assert.equal(report.discarded.length, 0);
});

test("a Windows-1252 file is read, flagged, and its accents decoded", () => {
  const bytes = Buffer.concat([
    Buffer.from("Domaine;Nom\nIng", "latin1"),
    Buffer.from([0xe9]),
    Buffer.from("nierie;DUPONT\n", "latin1"),
  ]);
  const { report, rdom } = runImportAudit([{ name: "RDOM.csv", bytes }], CONFIG, NOW);
  assert.equal(report.inventory[0]?.encoding, "windows-1252");
  assert.equal(rdom?.entries[0]?.domainId, "ingenierie");
  assert.ok(report.warnings.some((w) => /Windows-1252/.test(w.message)));
});

test("UTF-16 and non-csv files are inventoried and skipped", () => {
  const { report, rdom } = audit([
    { name: "seize.csv", bytes: Buffer.from([0xff, 0xfe, 0x41, 0x00]) },
    file("notes.txt", "pas un csv"),
  ]);
  assert.equal(rdom, null);
  const statuses = new Map(report.inventory.map((f) => [f.name, f.status]));
  assert.equal(statuses.get("seize.csv"), "unsupported");
  assert.equal(statuses.get("notes.txt"), "not-csv");
});

test("a near-miss header is inventoried and NOT parsed", () => {
  const { report, rdom } = audit([file("RDOM.csv", "Domaine\nInfra\n")]);
  assert.equal(rdom, null);
  assert.equal(report.inventory[0]?.status, "near-miss");
  assert.match(report.inventory[0]?.detail ?? "", /colonnes manquantes : Nom/);
  assert.equal(report.taken.length, 0);
});

test("empty lines above the header are skipped and flagged, file still read", () => {
  const { report, rdom } = audit([file("RDOM.csv", "\n\nDomaine;Nom\nInfra;SOLO\n")]);
  assert.equal(report.inventory[0]?.status, "recognized");
  assert.equal(rdom?.entries.length, 1);
  assert.equal(rdom?.entries[0]?.ref.line, 4);
  assert.ok(report.warnings.some((w) => /en-têtes reconnus ligne 3 — 2 ligne\(s\) ignorée\(s\) au-dessus/.test(w.message)));
});

test("no files at all: everything is expected, assembly says waiting", () => {
  const { report, rdom, spTotal } = audit([]);
  assert.equal(rdom, null);
  assert.equal(spTotal, null);
  assert.deepEqual(report.missingExpected.map((m) => m.name), ["RDOM", "SP_total", "projet", "ressources_PDC"]);
  assert.match(report.assembly[0]?.status ?? "", /absente/);
  assert.equal(report.assembly.length, 4);
});

test("the audit is deterministic for identical inputs", () => {
  const inputs = (): InputFile[] => [
    file("RDOM.csv", FULL_RDOM),
    file("SP_total.csv", FULL_SP),
    file("autre.csv", "Projet;Budget\nX;1"),
  ];
  const first = runImportAudit(inputs(), CONFIG, NOW);
  const second = runImportAudit(inputs(), CONFIG, NOW);
  assert.deepEqual(second.report, first.report);
});
