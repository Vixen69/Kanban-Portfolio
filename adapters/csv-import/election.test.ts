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

test("ADR 056: two Projets onglets without Responsable columns refuse the load — no election by Orga columns, header or name", () => {
  const raw = "Id;Nom;Type;État du processus;Domaine\nPE1;Un;Etude (Projet);Nouveau;DSI NEXTER.DOMAINE INFRASTRUCTURE\n";
  const { projets, cards, blockers, report } = runImportAudit([param(), file("B.csv", PERIMETER), file("A.csv", raw)], CONFIG, NOW);
  assert.equal(projets, null, "neither file is read as the perimeter");
  assert.equal(cards, null);
  assert.deepEqual(blockers.map((b) => [b.source, b.message]), [
    ["projets", "Deux fichiers Projets (onglet sans « Responsable 1 ») : « A.csv » et « B.csv » — n'en déposer qu'un."],
  ]);
  assert.ok(report.doubtful.some((d) => d.file === "B.csv, A.csv" || d.file === "A.csv, B.csv"));
  assert.match(report.assembly[0]?.status ?? "", /^refusé — Deux fichiers Projets/);
});

test("ADR 056: two full exports carrying « Responsable 1 » beside the onglet refuse the load too", () => {
  const other = FULL_EXPORT.replace("PE10003;Hors périmètre", "PE10004;Autre");
  const { blockers, projets } = runImportAudit(
    [param(), file("Projets.csv", PERIMETER), file("Export1.csv", FULL_EXPORT), file("Export2.csv", other)], CONFIG, NOW,
  );
  assert.equal(projets?.fileName, "Projets.csv", "the onglet is still read (the load is refused all the same)");
  assert.deepEqual(blockers.map((b) => b.message),
    ["Deux fichiers Projets avec « Responsable 1 » : « Export1.csv » et « Export2.csv » — n'en déposer qu'un."]);
});
