// Checks of the report model helpers (optional-field discipline) and of the
// French Markdown rendering (sections, counts, determinism).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createReport, discard, doubt, take, warn } from "./report.ts";
import { renderReport } from "./render-report.ts";

const WHEN = new Date("2026-07-29T12:00:00.000Z");

test("createReport starts with every section empty", () => {
  const report = createReport();
  assert.deepEqual(report, {
    inventory: [], missingExpected: [], assembly: [],
    taken: [], discarded: [], doubtful: [], warnings: [],
  });
});

test("helpers only assign optional fields when provided", () => {
  const report = createReport();
  take(report, { file: "f.csv", line: 2 }, "X", "domaine « ERP »");
  discard(report, "f.csv", "ligne vide");
  doubt(report, "f.csv", "question ?");
  warn(report, "message");
  assert.equal("note" in (report.taken[0] ?? {}), false);
  assert.equal("ref" in (report.discarded[0] ?? {}), false);
  assert.equal("value" in (report.doubtful[0] ?? {}), false);
  assert.equal("file" in (report.warnings[0] ?? {}), false);
  take(report, { file: "f.csv", line: 3 }, "Y", "dest", "par nom");
  discard(report, "f.csv", "raison", { ref: { file: "f.csv", line: 4 }, value: "v" });
  assert.equal(report.taken[1]?.note, "par nom");
  assert.equal(report.discarded[1]?.ref?.line, 4);
});

test("an empty report renders with « aucun » wording and the date", () => {
  const text = renderReport(createReport(), WHEN);
  assert.match(text, /# Rapport d'import — mode audit/);
  assert.match(text, /Généré le 2026-07-29 12:00 UTC\./);
  assert.match(text, /Aucun fichier reçu\./);
  assert.match(text, /## 1\. Pris \(0\)/);
  assert.match(text, /## 2\. Écarté \(0\)/);
  assert.match(text, /## 3\. Douteux \(0\)/);
  assert.match(text, /## Signalements \(0\)/);
});

test("entries render in insertion order with refs, values and notes", () => {
  const report = createReport();
  report.inventory.push({ name: "RDOM.csv", sizeBytes: 120, status: "recognized", contractId: "rdom", encoding: "utf-8" });
  report.missingExpected.push({ name: "SP_total", note: "contrat défini à l'étape 2" });
  report.assembly.push({ subject: "cartes", status: "en attente de `SP_total` (étape 2)" });
  take(report, { file: "RDOM.csv", line: 2 }, "DURAND", "domaine « Ingénierie »", "par nom");
  discard(report, "RDOM.csv", "domaine inconnu « Marketing »", { ref: { file: "RDOM.csv", line: 5 }, value: "PICARD" });
  doubt(report, "RDOM.csv", "même personne ?");
  warn(report, "séparateur « , » détecté", "RDOM.csv");
  const text = renderReport(report, WHEN);
  assert.match(text, /\| RDOM\.csv \| 120 o \| reconnu \(rdom\) \| utf-8 \| — \|/);
  assert.match(text, /- \*\*SP_total\*\* — contrat défini à l'étape 2/);
  assert.match(text, /- cartes : en attente de `SP_total` \(étape 2\)/);
  assert.match(text, /- `RDOM\.csv` ligne 2 : « DURAND » → domaine « Ingénierie » \(par nom\)/);
  assert.match(text, /- `RDOM\.csv` ligne 5 : « PICARD » — domaine inconnu « Marketing »/);
  assert.match(text, /- `RDOM\.csv` — même personne \?/);
  assert.match(text, /- `RDOM\.csv` : séparateur « , » détecté/);
});

test("rendering is deterministic and escapes pipes in table cells", () => {
  const report = createReport();
  report.inventory.push({ name: "a|b.csv", sizeBytes: 1, status: "not-csv" });
  const first = renderReport(report, WHEN);
  assert.equal(renderReport(report, WHEN), first);
  assert.match(first, /a\\\|b\.csv/);
});
