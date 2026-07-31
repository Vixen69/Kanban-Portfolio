// End-to-end checks of the audit pass against the real board config:
// inventory classification, per-contract election, header search under a
// preamble, the full four-file assembly, and determinism.

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

function fixture(name: string): InputFile {
  return { name, bytes: readFileSync(new URL(`../../fixtures/import/${name}`, import.meta.url)) };
}

function audit(files: InputFile[]) {
  return runImportAudit(files, CONFIG, NOW);
}

test("a clean RDOM file covers the nine domains without any anomaly", () => {
  const { report, rdom } = audit([file("RDOM.csv", FULL_RDOM)]);
  assert.equal(report.inventory[0]?.status, "recognized");
  assert.equal(report.taken.length, 9);
  assert.deepEqual(report.warnings, []);
  assert.equal(rdom?.namesByDomain.size, 9);
  assert.equal(report.assembly[0]?.status, "prête (9 noms, 9 domaines)");
  assert.deepEqual(report.missingExpected.map((m) => m.name), ["consolidé", "ressources_PDC"]);
});

test("SP_total alone: preamble skipped, cards waiting for the perimeter", () => {
  const { report, spTotal, cards } = audit([file("SP_total.csv", FULL_SP)]);
  assert.equal(report.inventory[0]?.status, "recognized");
  assert.ok(report.warnings.some((w) => /en-têtes reconnus ligne 2 — 1 ligne\(s\) ignorée\(s\) au-dessus/.test(w.message)));
  assert.equal(spTotal?.drafts.length, 2);
  assert.equal(cards, null);
  const cartes = report.assembly.find((a) => a.subject === "cartes");
  assert.match(cartes?.status ?? "", /en attente du `consolidé` — 2 sujet\(s\) SP_total lus/);
  const profile = report.assembly.find((a) => a.subject === "profil `SP_total`");
  assert.equal(profile?.status, "code PE : 1/2 · type : 1/2 · budget : 1/2 · date de début : 1/2");
});

test("the four fixture files assemble a full deck", () => {
  const { report, cards, consolide } = audit([
    fixture("RDOM.csv"), fixture("SP_total.csv"), fixture("Consolide.csv"), fixture("Projets.csv"),
  ]);
  assert.equal(consolide?.entries.length, 5);
  assert.equal(consolide?.excludedCount, 1);
  assert.equal(cards?.cards.length, 5);
  const byLabel = new Map(report.assembly.map((a) => [a.subject, a.status]));
  assert.equal(byLabel.get("périmètre `consolidé`"), "5 retenu(s) · 1 hors périmètre (isProjetSIS faux)");
  assert.equal(byLabel.get("cartes"), "5 — répartition : Demandes 2 · Actifs 1 · Exploitation 2");
  assert.equal(byLabel.get("position par jalons"), "5/5 via SP_total (nom 1 · code 4 · titre 0) · défaut : 0");
  assert.equal(byLabel.get("domaine"), "5/5 (consolidé 5 · RDOM 0) · manquant : 0");
  assert.equal(byLabel.get("chef de projet"), "5/5");
  assert.equal(byLabel.get("hors périmètre"), "3 sujet(s) SP_total non retenus par le consolidé");
  const first = cards?.cards[0];
  assert.equal(first?.title, "Modernisation atelier");
  assert.equal(first?.codename, "PE10001");
  assert.equal(first?.domainId, "infra");
  assert.equal(first?.owner, "Alice MERLE");
  assert.equal(first?.columnId, "exploitation");
  assert.equal(first?.typeId, "achat");
  assert.equal(first?.budgetRdli, 150);
  assert.ok(report.discarded.some((d) => /hors périmètre \(isProjetSIS faux\)/.test(d.reason)));
});

test("consolidé alone (the 2026-07-31 shape): cards assemble without SP_total", () => {
  const { report, cards } = audit([fixture("RDOM.csv"), fixture("Consolide.csv")]);
  assert.equal(cards?.cards.length, 5);
  const byLabel = new Map(report.assembly.map((a) => [a.subject, a.status]));
  assert.equal(byLabel.get("cartes"), "5 — répartition : Demandes 5");
  assert.match(byLabel.get("position") ?? "", /Demandes par défaut — règle « Jalon en cours » à dicter/);
  assert.equal(byLabel.get("domaine"), "5/5 (consolidé 5 · RDOM 0) · manquant : 0");
  const first = cards?.cards[0];
  assert.equal(first?.budgetRdli, 150);
  assert.equal(first?.budgetEstimated, 120.5);
  assert.equal(first?.effortEstimated, 110);
  assert.equal(first?.effortConsumed, 70);
  assert.equal(first?.dateRdr, "2026-09-15");
  assert.equal(first?.columnId, "demandes");
  const jalons = report.warnings.find((w) => /« Jalon en cours » — valeurs vues/.test(w.message));
  assert.match(jalons?.message ?? "", /« RDR » \(2\) ; « RDLI » \(1\) ; « RDO » \(2\)/);
});

test("a rich export carrying Domaine+Nom does not steal the RDOM contract", () => {
  const decoy =
    "Domaine;Nom;Colonne A;Responsable 1;Budget\n" +
    "Portefeuille X;Projet Alpha;a;M. Untel;12\n";
  const { report, rdom } = audit([file("a_projets.csv", decoy), file("z_rdom.csv", FULL_RDOM)]);
  assert.equal(rdom?.entries.length, 9);
  const doubt = report.doubtful.find((d) => d.file === "a_projets.csv");
  assert.match(doubt?.question ?? "", /écart\(s\) d'en-têtes, contre 0 pour « z_rdom\.csv »/);
});

test("two clean RDOM matches: first name wins the tie, second is doubtful", () => {
  const { report, rdom } = audit(
    [file("b.csv", FULL_RDOM), file("a.csv", "Domaine;Nom\nInfra;SOLO\n")],
  );
  assert.equal(rdom?.entries.length, 1);
  assert.equal(report.doubtful[0]?.file, "b.csv");
  assert.match(report.doubtful[0]?.question ?? "", /non retenu/);
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
});

test("empty lines above the header are skipped and flagged, file still read", () => {
  const { report, rdom } = audit([file("RDOM.csv", "\n\nDomaine;Nom\nInfra;SOLO\n")]);
  assert.equal(rdom?.entries.length, 1);
  assert.ok(report.warnings.some((w) => /en-têtes reconnus ligne 3 — 2 ligne\(s\) ignorée\(s\) au-dessus/.test(w.message)));
});

test("no files at all: everything is expected, assembly says waiting", () => {
  const { report, cards } = audit([]);
  assert.equal(cards, null);
  assert.deepEqual(report.missingExpected.map((m) => m.name),
    ["consolidé", "RDOM", "ressources_PDC"]);
  assert.equal(report.assembly.length, 3);
  assert.match(report.assembly[1]?.status ?? "", /en attente du `consolidé` \(source unique des cartes\)/);
});

test("the audit is deterministic for identical inputs", () => {
  const inputs = (): InputFile[] => [
    fixture("RDOM.csv"), fixture("SP_total.csv"), fixture("Consolide.csv"), fixture("Projets.csv"),
  ];
  const first = runImportAudit(inputs(), CONFIG, NOW);
  const second = runImportAudit(inputs(), CONFIG, NOW);
  assert.deepEqual(second.report, first.report);
});
