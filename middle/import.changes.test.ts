// The readable import report (ADR 055) over the synthetic fixtures: a full
// load, then a modified export set — one SP budget changed, one chef de
// projet changed, one plan de charge line changed, one project gone from
// the Coût file, one leaving on its state, one entering, one entering with
// a portfolio nothing resolves. The audit names exactly those, with their
// reasons and figures; the load returns the same; a re-audit of the same
// files then finds nothing to change.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BoardConfig } from "../core/types.ts";
import type { InputFile } from "../adapters/csv-import/index.ts";
import { validateBoardConfig } from "../core/config.ts";
import { auditImport, loadImport } from "./import.ts";
import { createJsonlStorage } from "./storage/jsonl.ts";

const CONFIG: BoardConfig = validateBoardConfig(
  JSON.parse(readFileSync(new URL("../config/board.json", import.meta.url), "utf8")),
);
const NOW = new Date("2026-09-08T09:00:00.000Z");
const FIXTURES = new URL("../fixtures/import/", import.meta.url);

function fixtureText(name: string): string {
  return readFileSync(new URL(name, FIXTURES), "utf8");
}

// Replaces one exact piece of a fixture; fails loudly when it is not there.
function edit(text: string, from: string, to: string): string {
  assert.ok(text.includes(from), `fixture piece not found: ${from}`);
  return text.replace(from, to);
}

function files(overrides: Record<string, string> = {}): InputFile[] {
  return readdirSync(FIXTURES).filter((name) => name.endsWith(".csv")).map((name) => ({
    name, bytes: new Uint8Array(Buffer.from(overrides[name] ?? fixtureText(name), "utf8")),
  }));
}

const PE10007 = "Coût prévisionnel;2026;Charge;CdP CORPORATE;20;0;15 000,00 €;;PE10007;Sécurisation accès;DSI NEXTER.CORPORATE.QUALITE;;FAUX;Etude (Projet);;Annulé;";

// The second export set: every change named in the header comment.
function modified(): InputFile[] {
  let couts = fixtureText("Couts.csv");
  couts = couts.split(/\r?\n/).filter((line) => !line.includes(";PE10002;")).join("\n");
  couts = edit(couts, "Projet ATLAS [Hors PDSI] (Projet);;Basculé en projet", "Projet ATLAS [Hors PDSI] (Projet);;Reporté");
  couts = edit(couts, "Etude (Opportunité);;Nouveau", "Etude (Opportunité);;Budget validé");
  couts += `\n${PE10007.replace("PE10007;Sécurisation accès;DSI NEXTER.CORPORATE.QUALITE", "PE30008;Durcissement postes;DSI NEXTER.CYBERSECURITE").replace("Annulé", "Budget validé")};;;;;;VRAI;10/09/2026`;
  return files({
    "Couts.csv": couts,
    "SP_2026.csv": edit(fixtureText("SP_2026.csv"), "120 500 €;80 000 €", "150 000 €;80 000 €"),
    "ProjetsCdP.csv": edit(fixtureText("ProjetsCdP.csv"), "PE10001;Modernisation atelier;LAMBERT Luc;Alice MERLE;", "PE10001;Modernisation atelier;LAMBERT Luc;Bruno DIAZ;"),
    "Ressources_PdC.csv": edit(fixtureText("Ressources_PdC.csv"), "PE10001;Modernisation atelier;Achat;PTF A;;;;;10;8;40;25;", "PE10001;Modernisation atelier;Achat;PTF A;;;;;10;8;55;25;"),
  });
}

async function withStorage(work: (storage: ReturnType<typeof createJsonlStorage>) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "kanban-import-changes-"));
  const storage = createJsonlStorage(join(dir, "board.jsonl"));
  try {
    await work(storage);
  } finally {
    await storage.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test("ADR 055: on an empty board every project enters with its reason; the files say what was taken", async () => {
  await withStorage(async (storage) => {
    const { changes } = await auditImport(storage, CONFIG, files(), NOW);
    assert.deepEqual(changes.files.map((f) => [f.source, f.file, f.status]), [
      ["couts", "Couts.csv", "pris"], ["param", "PARAM.csv", "pris"], ["projets", "Projets.csv", "pris"],
      ["cdp", "ProjetsCdP.csv", "pris"], ["jalons", "ProjetsJalons.csv", "pris"], ["sp", "SP_2026.csv", "pris"],
      ["pdc", "Ressources_PdC.csv", "pris"], ["profils", "Ress.Profils.csv", "pris"],
    ]);
    assert.equal(changes.files.find((f) => f.source === "projets")?.consequence, "recoupement seulement — le périmètre est COUT PREV");
    assert.deepEqual([changes.perimeter.source, changes.perimeter.file, changes.perimeter.retained, changes.perimeter.excluded.length], ["COUT PREV", "Couts.csv", 5, 11]);
    assert.deepEqual(changes.perimeter.excluded.find((x) => x.code === "PE10012"), { code: "PE10012", name: "Migration reportée", reason: "état « Reporté » hors des états retenus" });
    assert.deepEqual(changes.entered.map((e) => e.code), ["MEWTBN7Q", "PE10001", "PE10003", "PE10017", "PE10002"].sort((a, b) => titleOf(changes, a).localeCompare(titleOf(changes, b), "fr")));
    assert.equal(changes.entered.find((e) => e.code === "PE10002")?.reason, "nouveau dans le périmètre COUT PREV — état « Budget validé », type « Etude »");
    assert.deepEqual([changes.counts.created, changes.counts.updated, changes.counts.absent], [5, 0, 0]);
    assert.equal(changes.cardChanges.filter((c) => c.kind === "added").length, 5);
  });
});

function titleOf(changes: { entered: Array<{ code: string | null; title: string }> }, code: string): string {
  return changes.entered.find((e) => e.code === code)?.title ?? "";
}

test("ADR 055: a modified export set — the audit names exactly what the load will change and why; the load says the same", async () => {
  await withStorage(async (storage) => {
    await loadImport(storage, CONFIG, files(), NOW);
    const audit = await auditImport(storage, CONFIG, modified(), NOW);
    const { changes } = audit;
    assert.deepEqual(changes.entered.map((e) => [e.code, e.reason, e.domainWarning]), [
      ["PE10018", "nouveau dans le périmètre COUT PREV — état « Budget validé », type « Etude »", null],
      ["PE30008", "nouveau dans le périmètre COUT PREV — état « Budget validé », type « Etude »", "domaine non résolu → A&D par défaut, à corriger"],
    ].sort((a, b) => titleOf(changes, a[0] ?? "").localeCompare(titleOf(changes, b[0] ?? ""), "fr")));
    assert.deepEqual(changes.left.map((l) => [l.code, l.reason]), [
      ["PE10003", "écarté du périmètre COUT PREV : état « Reporté » hors des états retenus"],
      ["PE10002", "plus présent dans le fichier Coût « Couts.csv »"],
    ].sort((a, b) => leftTitle(changes, a[0] ?? "").localeCompare(leftTitle(changes, b[0] ?? ""), "fr")));
    assert.deepEqual(changes.back, []);
    const values = changes.cardChanges.filter((c) => !["added", "absent"].includes(c.kind));
    assert.deepEqual(values.map((c) => [c.kind, c.codename, c.kind === "figure" ? c.figure : c.kind === "plan" ? [c.plan.before, c.plan.after] : [c.from, c.to]]), [
      ["owner", "PE10001", ["Alice MERLE", "Bruno DIAZ"]],
      ["figure", "PE10001", { fact: "budgetEstimated", unit: "k€", before: 120.5, after: 150, delta: 29.5 }],
      ["plan", "PE10001", [{ planned: 115, done: 45, raf: 70, breakdown: true }, { planned: 130, done: 45, raf: 85, breakdown: true }]],
    ]);
    const plan = values.find((c) => c.kind === "plan");
    assert.ok(plan?.kind === "plan");
    assert.deepEqual(plan.plan.profiles, [{ profileId: "pmo", before: { planned: 55, done: 25, raf: 30 }, after: { planned: 70, done: 25, raf: 45 } }]);
    assert.deepEqual(changes.counts, { updated: 3, created: 2, absent: 2, back: 0, moved: 0, divergences: 0, valuesChanged: 1, valuesKept: 0 });
    const load = await loadImport(storage, CONFIG, modified(), NOW);
    assert.deepEqual(load.changes, changes, "the load did exactly what the audit announced");
    const again = await auditImport(storage, CONFIG, modified(), NOW);
    assert.deepEqual([again.changes.entered, again.changes.left, again.changes.cardChanges], [[], [], []], "the same files again: nothing changes");
    assert.equal(again.changes.counts.updated, 5);
  });
});

function leftTitle(changes: { left: Array<{ code: string | null; title: string }> }, code: string): string {
  return changes.left.find((l) => l.code === code)?.title ?? "";
}

test("ADR 055: a missing source says what the load keeps, and the facts kept name their cards", async () => {
  await withStorage(async (storage) => {
    await loadImport(storage, CONFIG, files(), NOW);
    const partial = files().filter((f) => f.name !== "SP_2026.csv" && f.name !== "ProjetsCdP.csv");
    const { changes } = await auditImport(storage, CONFIG, partial, NOW);
    const bySource = new Map(changes.files.map((f) => [f.source, f]));
    assert.deepEqual([bySource.get("sp")?.status, bySource.get("sp")?.consequence], ["absent", "budgets gardés (estimé, engagé, réalisé k€)"]);
    assert.deepEqual([bySource.get("cdp")?.status, bySource.get("cdp")?.file], ["pris", "Projets.csv"], "the onglet with Responsable columns lends its chefs de projet");
    const estimated = changes.kept.find((k) => k.label === "estimé k€");
    assert.ok(estimated !== undefined && estimated.cards.length > 0);
    assert.ok(estimated.cards.every((card) => card.code !== null && card.title !== ""));
    assert.equal(changes.cardChanges.filter((c) => c.kind === "figure").length, 0, "kept figures do not change");
    assert.equal(changes.counts.valuesKept, new Set(changes.kept.flatMap((k) => k.cards.map((c) => c.cardId))).size);
  });
});
