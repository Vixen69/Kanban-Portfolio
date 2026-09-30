// The refusals of ADR 056 reach the readable report (ADR 055): a load
// refused because of a side source (two SP files) or of a file name
// received twice says WHY, even when the perimeter assembled — the screen
// no longer reads « périmètre non assemblé » for them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { runImportAudit } from "./orchestrate.ts";
import type { InputFile } from "./orchestrate.ts";
import { importChanges } from "./import-changes.ts";

const CONFIG = JSON.parse(readFileSync(new URL("../../config/board.json", import.meta.url), "utf8")) as BoardConfig;
const NOW = new Date("2026-09-08T09:00:00.000Z");
const ALL = ["Couts.csv", "PARAM.csv", "Projets.csv", "ProjetsCdP.csv", "ProjetsJalons.csv", "Ress.Profils.csv", "Ressources_PdC.csv", "SP_2026.csv"];

function fixture(name: string, as = name): InputFile {
  return { name: as, bytes: new Uint8Array(readFileSync(new URL(`../../fixtures/import/${name}`, import.meta.url))) };
}

function changesOf(files: InputFile[]) {
  const audit = runImportAudit(files, CONFIG, NOW);
  return importChanges({ audit, config: CONFIG, year: 2026, plan: null, baseCards: [], events: [] });
}

test("ADR 056 → 055: no refusal, no blocker", () => {
  assert.deepEqual(changesOf(ALL.map((name) => fixture(name))).blockers, []);
});

test("ADR 056 → 055: two SP files — the perimeter assembled, the refusal is said", () => {
  const changes = changesOf([...ALL.map((name) => fixture(name)), fixture("SP_2026.csv", "SP copie.csv")]);
  assert.notEqual(changes.perimeter.source, null, "the perimeter is read");
  assert.deepEqual(changes.blockers, ["Deux fichiers SP : « SP copie.csv » et « SP_2026.csv » — n'en déposer qu'un."]);
});

test("ADR 056 → 055: one file name received twice — a refusal no chip carries", () => {
  const changes = changesOf([fixture("PARAM.csv"), fixture("Projets.csv"), fixture("Projets.csv")]);
  assert.ok(changes.blockers?.includes("Deux fichiers portent le même nom « Projets.csv » — n'en déposer qu'un."));
});
