// End-to-end checks of the audit pass against the real board config:
// inventory classification (retired contract included), per-contract
// election, header search under a preamble, the full five-file assembly
// (perimeter + jalons + SP + PdC through PARAM), the raw-export path, and
// determinism.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { runImportAudit } from "./orchestrate.ts";
import type { InputFile } from "./orchestrate.ts";

const CONFIG = JSON.parse(
  readFileSync(new URL("../../config/board.json", import.meta.url), "utf8"),
) as BoardConfig;

const NOW = new Date("2026-09-04T12:00:00.000Z");

function file(name: string, content: string): InputFile {
  return { name, bytes: Buffer.from(content, "utf8") };
}

function fixture(name: string): InputFile {
  return { name, bytes: readFileSync(new URL(`../../fixtures/import/${name}`, import.meta.url)) };
}

const ALL = ["PARAM.csv", "Projets.csv", "ProjetsJalons.csv", "SP_2026.csv", "Ressources_PdC.csv", "Ress.Profils.csv", "ProjetsCdP.csv"];

function audit(files: InputFile[]) {
  return runImportAudit(files, CONFIG, NOW);
}

test("a July RDOM file is inventoried as a retired contract, never parsed", () => {
  const { report, param } = audit([file("RDOM.csv", "Domaine;Nom\nA&D;BERGER\n")]);
  assert.equal(report.inventory[0]?.status, "retired");
  assert.equal(report.inventory[0]?.contractId, "rdom");
  assert.equal(param, null);
  assert.deepEqual(report.missingExpected.map((m) => m.name),
    ["Projets", "PARAM", "ProjetsJalons", "SP (exercice ou total)", "Ressources_PdC", "Ress.Profils", "ProjetsCdP"]);
});

test("the five fixture files assemble the full deck", () => {
  const { report, cards, projets, jalons, sp, chargeStats, capacity } = audit(ALL.map(fixture));
  assert.deepEqual(report.inventory.map((f) => [f.name, f.status]), [
    ["PARAM.csv", "recognized-with-deviations"], ["Projets.csv", "recognized"], ["ProjetsCdP.csv", "recognized"],
    ["ProjetsJalons.csv", "recognized"], ["Ress.Profils.csv", "recognized"], ["Ressources_PdC.csv", "recognized-with-deviations"], ["SP_2026.csv", "recognized"],
  ]);
  assert.deepEqual(report.missingExpected, []);
  assert.ok(report.warnings.some((w) => w.file === "SP_2026.csv" && /en-têtes reconnus ligne 2 — 1 ligne\(s\) ignorée\(s\)/.test(w.message)));
  assert.equal(projets?.entries.length, 6);
  assert.equal(jalons?.entries.length, 6);
  assert.equal(sp?.entries.length, 5);
  assert.equal(cards?.cards.length, 6);
  assert.equal(report.taken.length, 6, "the pris lines are the cards");
  const byLabel = new Map(report.assembly.map((a) => [a.subject, a.status]));
  assert.equal(byLabel.get("table PARAM"), "prête (5 responsable(s) de domaine · 7 ligne(s) organisation, 7 avec chemin)");
  assert.match(byLabel.get("périmètre `projets`") ?? "", /^6 carte\(s\) — la liste fait foi \(« Projets\.csv »\) · types : .*Étude 2.*hors des quatre retenus 1 · domaine : colonnes Orga \(direct\)$/);
  assert.equal(byLabel.get("cartes"), "6 — répartition : Demandes 2 · Études 1 · Actifs 1 · Exploitation 2");
  assert.equal(byLabel.get("position"),
    "jalons 5/6 (Exploitation 2 · Actifs 1 · Études 1 · entrée 1) · sans jalon : 1 → colonne d'entrée · lignes jalons hors périmètre : 1");
  assert.equal(byLabel.get("domaine"), "6/6 (direct 6 · via PARAM 0 · manquant 0) · sous-domaine : 3 détaillé(s), 2 replié(s) dans leur domaine");
  assert.equal(byLabel.get("chef de projet"),
    "6/6 (dont 1 via ProjetsCdP · 1 ligne(s) ProjetsCdP hors périmètre) · responsables de domaine exclus : 4");
  const carto = cards?.cards.find((c) => c.codename === "PE10008");
  assert.equal(carto?.owner, "Farid KOVAC", "BARBIER Anne is a PARAM domain lead, excluded");
  assert.match(byLabel.get("coûts 2026 (SP)") ?? "", /^4\/6 jointes \(Id 3 · nom 1 · code 0\) · sans correspondance : 2 · sujets SP hors périmètre : 1 · RDLI/);
  assert.match(byLabel.get("plan de charge") ?? "", /^3\/6 cartes couvertes .* projets PdC hors périmètre : 1 · cartes sans charge : 3 · non nominatives : 3 ligne\(s\) \(75 j\.h, gardées sur les projets\)$/);
  assert.equal(chargeStats?.covered, 3);
  const snapshot = capacity?.snapshot;
  assert.ok(snapshot);
  assert.equal(snapshot.exerciseYear, 2026);
  assert.ok(snapshot.assignments.every((a) => /^p-[0-9a-f]{16}$/.test(a.personId)));
  assert.ok(snapshot.assignments.every((a) => snapshot.persons.some((p) => p.id === a.personId)));
  assert.deepEqual(snapshot.persons.map((p) => p.source), ["profils", "profils", "profils", "profils", "profils"]);
  assert.match(byLabel.get("capacité") ?? "", /^5 personne\(s\) dont 1 externe\(s\) · capacité 780 j\.h · 0 sans fiche · affectations : 3 sur 3 carte\(s\) · demande du tableau 85 j\.h · projeté \(tout le plan de charge\) [\d,]+ j\.h · réalisé [\d,]+ j\.h · 2 hors plan de charge · capacité lue dans le PdC pour 2 personne\(s\)$/);
  const alice = snapshot.persons.find((p) => p.name === "Jean ROCA");
  assert.ok(alice && alice.plannedJh !== null && alice.plannedJh > 0, "whole-plan totals reach the person");
});

test("each card carries the right position, vocabulary and costs", () => {
  const { cards } = audit(ALL.map(fixture));
  const byCode = new Map(cards?.cards.map((c) => [c.codename, c]));
  const atelier = byCode.get("PE10001");
  assert.equal(atelier?.columnId, "exploitation");
  assert.deepEqual([atelier?.domainId, atelier?.subDomainId, atelier?.domainSource], ["infra", null, "orga"]);
  assert.equal(atelier?.owner, "Alice MERLE", "LAMBERT Luc is a domain lead");
  assert.equal(atelier?.typeId, "mise_en_oeuvre");
  assert.deepEqual([atelier?.budgetEstimated, atelier?.budgetConsumed, atelier?.budgetEngaged, atelier?.budgetRdli], [120.5, 80, 30, 150]);
  assert.deepEqual([atelier?.effortEstimated, atelier?.effortConsumed], [110, 70]);
  assert.equal(atelier?.charges.length, 2);
  const portail = byCode.get("PE10002");
  assert.deepEqual([portail?.columnId, portail?.typeId, portail?.subDomainId], ["actifs", "etude", "developpements_rapides"]);
  const connectivite = byCode.get("MEWTBN7Q");
  assert.deepEqual([connectivite?.columnId, connectivite?.domainId, connectivite?.subDomainId], ["demandes", "corporate", "achats"]);
  assert.equal(connectivite?.budgetEstimated, 30, "SP joined by name (no Id in that SP row)");
  const carto = byCode.get("PE10008");
  assert.deepEqual([carto?.columnId, carto?.typeId, carto?.subDomainId, carto?.owner, carto?.budgetEstimated],
    ["demandes", null, null, "Farid KOVAC", null]);
  assert.equal(byCode.get("PE10007")?.columnId, "exploitation", "RDR dated 01/06/2026, past");
});

test("the doubts name the vocabulary questions to settle", () => {
  const { report } = audit(ALL.map(fixture));
  const questions = report.doubtful.map((d) => d.question);
  assert.ok(questions.some((q) => /« Domaine \(Orga\) » inconnu du board : « CYBER »/.test(q)));
  assert.ok(questions.some((q) => /type hors des quatre retenus : « TMA Corrective \(Run\) »/.test(q)));
  assert.ok(questions.some((q) => /sous-domaine inconnu de la config : « corporate \/ INEXISTANT »/.test(q)));
  assert.ok(report.warnings.some((w) => /RDR franchi sans RDLI franchi/.test(w.message)));
  assert.ok(report.warnings.some((w) => /cellules « franchi » — valeurs vues/.test(w.message)));
});

test("a raw Sciforma export is translated through PARAM", () => {
  const raw =
    "Fichier;Id;Nom;Domaine;Portefeuille;Type;État du processus;Responsable 1;Responsable 2;Responsable 3;Responsable portefeuilles\n" +
    "x;PE10001;Modernisation atelier;DSI NEXTER.DOMAINE INFRASTRUCTURE;P;Projet de mise en oeuvre (Projet);En cours;LAMBERT Luc;Alice MERLE;;\n" +
    "x;MEWTBN7Q;Étude connectivité site B;DSI NEXTER.DOMAINE METIER.CORPORATE.ACHATS;P;Etude (Projet);Nouveau;Dan ROY;;;\n";
  const { cards, projets } = audit([fixture("PARAM.csv"), file("Projets_brut.csv", raw)]);
  assert.equal(projets?.shape, "path");
  assert.deepEqual(cards?.cards.map((c) => [c.domainId, c.subDomainId, c.domainSource]), [
    ["infra", null, "param"], ["corporate", "achats", "param"],
  ]);
  assert.equal(cards?.cards[0]?.owner, "Alice MERLE");
});

test("two files matching one contract: the cleanest header wins, the other is questioned", () => {
  const clean = "Id;Nom;Type;État du processus\nPE1;Un;Etude;Nouveau\n";
  const dirty = "Id;Nom;Type;État du processus;Extra\nPE2;Deux;Etude;Nouveau;x\n";
  const { report, projets } = audit([file("b.csv", dirty), file("a.csv", clean)]);
  assert.equal(projets?.entries[0]?.name, "Un");
  assert.ok(report.doubtful.some((d) => d.file === "b.csv" && /non retenu/.test(d.question)));
});

test("without the perimeter, the other tables wait", () => {
  const { report, cards } = audit([fixture("ProjetsJalons.csv"), fixture("SP_2026.csv")]);
  assert.equal(cards, null);
  const byLabel = new Map(report.assembly.map((a) => [a.subject, a.status]));
  assert.equal(byLabel.get("cartes"), "en attente de `projets` (le périmètre)");
  assert.equal(byLabel.get("jalons"), "6 ligne(s) lue(s) — en attente de `projets`");
  assert.equal(byLabel.get("coûts 2026 (SP)"), "5 sujet(s) lu(s) — en attente de `projets`");
});

test("the audit is deterministic for identical inputs", () => {
  const first = audit(ALL.map(fixture));
  const second = audit(ALL.map(fixture));
  assert.deepEqual(second.report, first.report);
  assert.deepEqual(second.cards, first.cards);
});

test("a second full Projets export lends its chefs de projet when no ProjetsCdP file came", () => {
  const files = ALL.filter((name) => name !== "ProjetsCdP.csv").map(fixture);
  const { report, cdp, projets } = audit([...files, { ...fixture("Projets.csv"), name: "ProjetsExport.csv" }]);
  assert.ok(cdp);
  assert.equal(projets?.entries.length, 6, "the perimeter is still the first Projets file");
  assert.ok(report.warnings.some((w) => w.file === "ProjetsExport.csv" && /lu comme ProjetsCdP/.test(w.message)));
  const byLabel = new Map(report.assembly.map((a) => [a.subject, a.status]));
  assert.equal(byLabel.get("chef de projet"),
    "5/6 (dont 0 via ProjetsCdP · 0 ligne(s) ProjetsCdP hors périmètre) · responsables de domaine exclus : 4");
});
