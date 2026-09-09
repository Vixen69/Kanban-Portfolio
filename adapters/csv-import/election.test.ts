// The perimeter election (author, 2026-09-09): among several Projets-shaped
// files, the PMO's onglet without Responsable columns is the perimeter; a
// full export carrying them feeds the chefs de projet. Reproduces the
// September audit where the cleanest-header rule elected the 1 357-row
// export over the 138-row perimeter.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { runImportAudit } from "./orchestrate.ts";
import type { InputFile } from "./orchestrate.ts";

const CONFIG = JSON.parse(
  readFileSync(new URL("../../config/board.json", import.meta.url), "utf8"),
) as BoardConfig;
const NOW = new Date("2026-09-09T12:00:00.000Z");

function file(name: string, content: string): InputFile {
  return { name, bytes: Buffer.from(content, "utf8") };
}

function param(): InputFile {
  return { name: "PARAM.csv", bytes: readFileSync(new URL("../../fixtures/import/PARAM.csv", import.meta.url)) };
}

const PERIMETER =
  "Id;Nom;Type;État du processus;Domaine (Orga);Ss-Daine (Orga);Extra\n" +
  "PE10001;Modernisation atelier;Projet de mise en oeuvre (Projet);En cours;INFRA;;x\n" +
  "PE10002;Étude connectivité site B;Etude (Projet);Nouveau;A&D;FORGE LOGICIELS;x\n";

const FULL_EXPORT =
  "Id;Nom;Type;État du processus;Domaine;Responsable 1;Responsable 2\n" +
  "PE10001;Modernisation atelier;Projet de mise en oeuvre (Projet);En cours;DSI NEXTER.DOMAINE INFRASTRUCTURE;LAMBERT Luc;Alice MERLE\n" +
  "PE10002;Étude connectivité site B;Etude (Projet);Nouveau;DSI NEXTER.DOMAINE A&D;Dan ROY;\n" +
  "PE10003;Hors périmètre;Etude (Projet);Nouveau;DSI NEXTER.DOMAINE INFRASTRUCTURE;Zoé LEM;\n";

test("the perimeter is the Projets file without Responsable columns, even when the full export sorts first and has the cleaner header", () => {
  const { report, projets, cards, cdp } = runImportAudit(
    [param(), file("A_export_complet.csv", FULL_EXPORT), file("Projets.csv", PERIMETER)], CONFIG, NOW,
  );
  assert.equal(projets?.fileName, "Projets.csv");
  assert.equal(cards?.cards.length, 2, "the 3-row export is not the perimeter");
  assert.notEqual(cdp, null, "the export lends its chefs de projet");
  assert.equal(cards?.cards[0]?.owner, "Alice MERLE", "LAMBERT Luc is a PARAM domain lead, excluded");
  assert.equal(cards?.cards[1]?.owner, "Dan ROY");
  const question = report.doubtful.find((d) => d.file === "A_export_complet.csv")?.question ?? "";
  assert.match(question, /non retenu comme périmètre : il porte « Responsable 1 »/);
  assert.match(question, /périmètre = « Projets\.csv »/);
  const byLabel = new Map(report.assembly.map((a) => [a.subject, a.status]));
  assert.match(byLabel.get("périmètre `projets`") ?? "", /^2 carte\(s\) — la liste fait foi \(« Projets\.csv »\) · types/);
});

test("alone, a full export carrying the Responsable columns is still the perimeter", () => {
  const { projets, cards } = runImportAudit([param(), file("Projets.csv", FULL_EXPORT)], CONFIG, NOW);
  assert.equal(projets?.fileName, "Projets.csv");
  assert.equal(cards?.cards.length, 3);
  assert.equal(cards?.cards[0]?.owner, "Alice MERLE");
});

test("two files without Responsable columns: the consolidated Orga columns win, then the cleanest header", () => {
  const raw = "Id;Nom;Type;État du processus;Domaine\nPE1;Un;Etude (Projet);Nouveau;DSI NEXTER.DOMAINE INFRASTRUCTURE\n";
  const { projets, report } = runImportAudit([param(), file("A.csv", raw), file("B.csv", PERIMETER)], CONFIG, NOW);
  assert.equal(projets?.fileName, "B.csv", "Orga columns beat a cleaner header and an earlier name");
  assert.match(report.doubtful.find((d) => d.file === "A.csv")?.question ?? "", /périmètre = « B\.csv »/);
  const clean = "Id;Nom;Type;État du processus\nPE1;Un;Etude (Projet);Nouveau\n";
  const dirty = "Id;Nom;Type;État du processus;Extra\nPE2;Deux;Etude (Projet);Nouveau;x\n";
  const second = runImportAudit([file("b.csv", dirty), file("a.csv", clean)], CONFIG, NOW);
  assert.equal(second.projets?.fileName, "a.csv", "no Responsable, no Orga: the cleanest header wins");
});
