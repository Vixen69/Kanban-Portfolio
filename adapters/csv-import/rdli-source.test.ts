// The four k€ figures of a card come from SP alone (author, 2026-09-10):
// the Projets « Budget RDLI Total Coût (Res+Trans) » is plurianual and no
// longer feeds the card, even when SP leaves the envelope empty. The
// « coûts (SP) » line counts the filled figures so the report says by
// itself whether the amounts got through.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { runImportAudit } from "./orchestrate.ts";
import type { InputFile } from "./orchestrate.ts";

const CONFIG = JSON.parse(
  readFileSync(new URL("../../config/board.json", import.meta.url), "utf8"),
) as BoardConfig;
const NOW = new Date("2026-09-10T12:00:00.000Z");

function file(name: string, content: string): InputFile {
  return { name, bytes: Buffer.from(content, "utf8") };
}

const PROJETS =
  "Id;Nom;Type;État du processus;Domaine (Orga);Budget RDLI Total Coût (Res+Trans)\n" +
  "PE1;Un;Etude (Projet);Nouveau;INFRA;999\n" +
  "PE2;Deux;Etude (Projet);Nouveau;INFRA;888\n" +
  "PE3;Trois;Etude (Projet);Nouveau;INFRA;777\n";

const SP =
  "Id;Nom;Coût prév (ME);Coût réel;Engagé Achats;* Budget validé RDLI\n" +
  "PE1;Un;501 k;120 k;30 k;150\n" +
  "PE2;Deux;;;;\n";

test("RDLI comes from SP only; the plurianual Projets envelope never reaches the card", () => {
  const { cards, report } = runImportAudit([file("Projets.csv", PROJETS), file("SP_2026.csv", SP)], CONFIG, NOW);
  const byCode = new Map(cards?.cards.map((c) => [c.codename, c]));
  assert.deepEqual(
    [byCode.get("PE1")?.budgetRdli, byCode.get("PE1")?.budgetEstimated, byCode.get("PE1")?.budgetConsumed, byCode.get("PE1")?.budgetEngaged],
    [150, 501, 120, 30], "SP figures, the bare « k » read as k€");
  assert.equal(byCode.get("PE2")?.budgetRdli, null, "SP row without envelope: no fallback on the plurianual 888");
  assert.equal(byCode.get("PE3")?.budgetRdli, null, "no SP row: nothing, never 777");
  const line = report.assembly.find((a) => a.subject === "coûts 2026 (SP)")?.status ?? "";
  assert.match(line, /^2\/3 jointes \(Id 2 · nom 0 · code 0\) · sans correspondance : 1/);
  assert.match(line, /RDLI depuis SP/);
  assert.match(line, /montants renseignés : estimé 1\/3 · réel 1\/3 · engagé 1\/3 · RDLI 1\/3/);
});
