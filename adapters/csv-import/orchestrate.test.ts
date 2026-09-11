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
import { cardId } from "./to-cards.ts";

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
    ["Coût prévisionnel (COUT PREV)", "Projets", "PARAM", "ProjetsJalons", "SP (exercice ou total)", "Ressources_PdC", "Ress.Profils", "ProjetsCdP"]);
});

test("the five fixture files assemble the full deck", () => {
  const { report, cards, projets, jalons, sp, chargeStats, capacity } = audit(ALL.map(fixture));
  assert.deepEqual(report.inventory.map((f) => [f.name, f.status]), [
    ["PARAM.csv", "recognized-with-deviations"], ["Projets.csv", "recognized"], ["ProjetsCdP.csv", "recognized"],
    ["ProjetsJalons.csv", "recognized"], ["Ress.Profils.csv", "recognized"], ["Ressources_PdC.csv", "recognized-with-deviations"], ["SP_2026.csv", "recognized"],
  ]);
  assert.deepEqual(report.missingExpected.map((m) => m.name), ["Coût prévisionnel (COUT PREV)"], "the COUT PREV export is preferred, not required");
  assert.ok(report.warnings.some((w) => w.file === "SP_2026.csv" && /en-têtes reconnus ligne 2 — 1 ligne\(s\) ignorée\(s\)/.test(w.message)));
  assert.equal(projets?.entries.length, 6);
  assert.equal(jalons?.entries.length, 6);
  assert.equal(sp?.entries.length, 5);
  assert.equal(cards?.cards.length, 6);
  assert.equal(report.taken.length, 6, "the pris lines are the cards");
  const byLabel = new Map(report.assembly.map((a) => [a.subject, a.status]));
  assert.equal(byLabel.get("table PARAM"), "prête (5 responsable(s) de domaine · 7 ligne(s) organisation, 7 avec chemin)");
  assert.match(byLabel.get("périmètre `projets`") ?? "", /^6 carte\(s\) — la liste fait foi \(« Projets\.csv »\) · types : .*Étude 2.*hors des types retenus 1 · domaine : colonnes Orga \(direct\)$/);
  assert.equal(byLabel.get("cartes"), "6 — répartition : Demandes 2 · Études 1 · Actifs 1 · Done 2");
  assert.equal(byLabel.get("position"),
    "jalons 5/6 (Done 2 · Actifs 1 · Études 1 · entrée 1) · sans jalon : 1 → colonne d'entrée · lignes jalons hors périmètre : 1" +
    " · cellules décidées par : statut 10 · date 0 · « franchi » 8");
  assert.equal(byLabel.get("domaine"), "6/6 (direct 6 · via PARAM 0 · manquant 0) · sous-domaine : 3 détaillé(s), 2 replié(s) dans leur domaine");
  assert.equal(byLabel.get("chef de projet"),
    "6/6 (dont 1 via ProjetsCdP · 1 ligne(s) ProjetsCdP hors périmètre) · responsables de domaine exclus : 4");
  const carto = cards?.cards.find((c) => c.codename === "PE10008");
  assert.equal(carto?.owner, "Farid KOVAC", "BARBIER Anne is a PARAM domain lead, excluded");
  assert.match(byLabel.get("coûts 2026 (SP)") ?? "", /^4\/6 jointes \(Id 3 · nom 1 · code 0\) · sans correspondance : 2 · sujets SP hors périmètre : 1 · RDLI/);
  assert.match(byLabel.get("plan de charge") ?? "", /^3\/6 cartes couvertes .* projets PdC hors périmètre : 1 · cartes sans charge : 3 · non nominatives : 3 ligne\(s\) \(75 j\.h, gardées sur les projets\)$/);
  assert.equal(chargeStats?.covered, 3);
});

test("capacity (ADR 029): the plan de charge is the only source of persons; per-domain lines", () => {
  const { report, capacity } = audit(ALL.map(fixture));
  const byLabel = new Map(report.assembly.map((a) => [a.subject, a.status]));
  assert.equal(byLabel.get("plan de charge · lecture"),
    "12 ligne(s) lue(s) : 7 affectations projet · 2 lignes « Disponible ressource » · 3 lignes « Planifiée projet »" +
    " · matricule vide : 1 · matricule lu dans « Ressource » : 0 · personnes nominatives : 3");
  const snapshot = capacity?.snapshot;
  assert.ok(snapshot);
  assert.equal(snapshot.exerciseYear, 2026);
  assert.ok(snapshot.assignments.every((a) => /^p-[0-9a-f]{16}$/.test(a.personId)));
  assert.ok(snapshot.assignments.every((a) => snapshot.persons.some((p) => p.id === a.personId)));
  assert.deepEqual(snapshot.persons.map((p) => p.source), ["pdc", "pdc", "pdc"], "the plan de charge is the only source of persons (ADR 029)");
  assert.deepEqual(snapshot.persons.map((p) => [p.name, p.domain, p.profileId, p.external, p.capacityJh, p.plannedJh]).sort(), [
    ["Jean ROCA", "infra", "pmo", false, 200, 70], ["Luc BER", "ad", "pmo", true, null, 25], ["Zoé LANE", "ad", null, false, 180, 15],
  ]);
  assert.equal(byLabel.get("capacité"),
    "3 personne(s) nominatives du plan de charge dont 1 externe(s) · capacité 380 j.h (1 sans ligne « Disponible ») · domaine 3/3 (Organisation → PARAM 3)" +
    " · affectations : 3 sur 3 carte(s) · demande du tableau 85 j.h · projeté (tout le plan de charge) 110 j.h · réalisé 58 j.h");
  assert.equal(byLabel.get("capacité · INFRA"),
    "1 personne(s) (1 interne(s) · 0 externe(s)) · capacité 200 j.h · projeté 70 j.h · demande du tableau 70 j.h · libre 130 j.h · surcharge 0 j.h");
  assert.match(byLabel.get("capacité · A&D") ?? "", /^2 personne\(s\) \(1 interne\(s\) · 1 externe\(s\)\) · capacité 180 j\.h \(1 sans ligne « Disponible »\)/);
  const alice = snapshot.persons.find((p) => p.name === "Jean ROCA");
  assert.ok(alice && alice.plannedJh !== null && alice.plannedJh > 0, "whole-plan totals reach the person");
  const atelierId = snapshot.assignments.find((a) => a.personId === alice?.id)?.cardId;
  assert.deepEqual(snapshot.generic?.map((g) => [g.metier, g.domain, g.cardId === atelierId, g.jh, g.done]), [
    ["Externe.Concept.Dév.", "ad", true, 60, 20], ["PMO", "infra", true, 15, 0],
  ], "ADR 033: the generic rows reach the snapshot by métier, with domain and card");
});

test("each card carries the right position, vocabulary and costs", () => {
  const { cards } = audit(ALL.map(fixture));
  const byCode = new Map(cards?.cards.map((c) => [c.codename, c]));
  const atelier = byCode.get("PE10001");
  assert.equal(atelier?.columnId, "done", "RDR approuvé = Done (author, 2026-09-11)");
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
  assert.equal(byCode.get("PE10007")?.columnId, "done", "RDR statut Approuvé (its « franchi » cell is a date)");
});

test("the doubts name the vocabulary questions to settle", () => {
  const { report } = audit(ALL.map(fixture));
  const questions = report.doubtful.map((d) => d.question);
  assert.ok(questions.some((q) => /« Domaine \(Orga\) » inconnu du board : « CYBER »/.test(q)));
  assert.ok(questions.some((q) => /type hors des types retenus : « TMA Corrective \(Run\) »/.test(q)));
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

test("the COUT PREV export is the perimeter when present; the Projets onglet only cross-checks (ADR 030)", () => {
  const { report, projets, couts, perimeterCheck, cards } = audit([...ALL, "Couts.csv"].map(fixture));
  assert.ok(couts);
  assert.equal(projets, couts, "the perimeter is the COUT PREV table");
  assert.deepEqual(projets.entries.map((e) => e.id), ["PE10001", "PE10002", "PE10003", "MEWTBN7Q", "PE10017"]);
  assert.deepEqual(report.missingExpected, []);
  assert.ok(report.inventory.some((f) => f.name === "Couts.csv" && f.status === "recognized"));
  const byLabel = new Map(report.assembly.map((a) => [a.subject, a.status]));
  assert.match(byLabel.get("périmètre `projets`") ?? "",
    /^5 carte\(s\) — la liste fait foi \(« Couts\.csv »\) · types : .*Étude 2.*ATLAS 1.* · domaine : portefeuille Sciforma/);
  assert.equal(byLabel.get("périmètre · lecture COUT PREV"),
    "18 ligne(s) · 16 projet(s) distinct(s) · retenus 5 (1 hors PE) · écartés : hors 2026 1" +
    " · état hors liste 5 (Annulé 1, Budget présenté 1, Reporté 1, Fusionné 1, Nouveau 1) · type hors config 3 (Achat 1, Evolution - TMA 1, RUN 1)" +
    " · arbitrage 1 · sans ME 1 · « Projet.Actif » faux gardés 1 · domaine via portefeuille 4/5");
  assert.equal(byLabel.get("périmètre · recoupement"),
    "5 projet(s) dans « Couts.csv » (COUT PREV, fait foi) · 6 dans « Projets.csv » · 4 commun(s)" +
    " · seulement COUT PREV : 1 (PE10017) · seulement Projets : 2 (PE10007, PE10008)");
  assert.deepEqual(perimeterCheck?.onlyProjets, ["PE10007", "PE10008"]);
  assert.ok(report.warnings.some((w) => w.file === "Projets.csv" && /ne sert qu'au recoupement/.test(w.message)));
  const byCode = new Map(cards?.cards.map((c) => [c.codename, c]));
  const atelier = byCode.get("PE10001");
  assert.deepEqual([atelier?.domainId, atelier?.domainSource, atelier?.columnId, atelier?.budgetEstimated], ["infra", "param", "done", 120.5]);
  assert.deepEqual([byCode.get("PE10017")?.columnId, byCode.get("PE10017")?.typeId, byCode.get("PE10017")?.domainId], ["demandes", "etude", null],
    "no jalon, PROJETS VENDUS resolves to no domain");
  assert.equal(byCode.has("PE10009"), false, "« Budget présenté » is outside the retained states");
  assert.equal(byCode.get("PE10003")?.typeId, "atlas", "the author's fifth type, read through its alias");
  assert.ok(report.doubtful.some((d) => /codes retenus hors PE : 1 \(MEWTBN7Q\)/.test(d.question)));
});

test("ADR 034: the COUT PREV « Charge » rows reach the snapshot as demand by cost centre, on the cards", () => {
  const { report, capacity, cards } = audit([...ALL, "Couts.csv"].map(fixture));
  const codeOf = new Map(cards?.cards.map((c) => [cardId(c), c.codename]));
  assert.deepEqual(capacity?.snapshot.coutsDemand?.map((d) => [d.centre, codeOf.get(d.cardId ?? ""), d.jh, d.done]), [
    ["CdP INFRA BUILD", "PE10001", 40, 25], ["Concept.Dév.", "PE10002", 30, 10], ["Architecte", "PE10003", 15, 18], ["Concept.Dév.", "PE10017", 3, 0],
  ]);
  const byLabel = new Map(report.assembly.map((a) => [a.subject, a.status]));
  assert.match(byLabel.get("capacité") ?? "", /demande COUT PREV sur les cartes 88 j\.h \(4 ligne\(s\) « Charge »\)$/);
});

test("with COUT PREV as perimeter, a Projets onglet carrying Responsable lends its chefs de projet when no ProjetsCdP came", () => {
  const files = ALL.filter((name) => name !== "ProjetsCdP.csv");
  const { report, cards, cdp } = audit([...files, "Couts.csv"].map(fixture));
  assert.ok(cdp);
  assert.ok(report.warnings.some((w) => w.file === "Projets.csv" && /lu aussi comme ProjetsCdP/.test(w.message)));
  assert.equal(new Map(cards?.cards.map((c) => [c.codename, c])).get("PE10001")?.owner, "Alice MERLE");
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
