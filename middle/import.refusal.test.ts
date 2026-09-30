// The audit and the load share ONE refusal rule (loadRefusal): files the
// load would refuse — a closed exercise, files of another year, no
// perimeter — are never previewed as loadable, and the audit says why
// with the very words the load would answer.

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

function files(only?: readonly string[]): InputFile[] {
  return readdirSync(FIXTURES)
    .filter((name) => name.endsWith(".csv") && (only === undefined || only.includes(name)))
    .map((name) => ({ name, bytes: new Uint8Array(readFileSync(new URL(name, FIXTURES))) }));
}

async function withStorage(work: (storage: ReturnType<typeof createJsonlStorage>) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "kanban-import-refusal-"));
  const storage = createJsonlStorage(join(dir, "board.jsonl"));
  try {
    await work(storage);
  } finally {
    await storage.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

const CASES: ReadonlyArray<{ name: string; files: () => InputFile[]; year: number; refusal: RegExp }> = [
  { name: "a closed exercise", files: () => files(), year: CONFIG.exercise.year - 1, refusal: /^Exercice 2025 clos : chargement refusé\.$/ },
  { name: "the files of another year", files: () => files(), year: CONFIG.exercise.year + 1, refusal: /aucun projet retenu pour l’exercice 2027 \(fichiers d’une autre année \?\)/ },
  { name: "no perimeter", files: () => files(["PARAM.csv"]), year: CONFIG.exercise.year, refusal: /aucune carte assemblée/ },
];

for (const c of CASES) {
  test(`the audit of ${c.name} is not loadable, says why and previews nothing; the load answers the same`, async () => {
    await withStorage(async (storage) => {
      await loadImport(storage, CONFIG, files(), NOW);
      const audit = await auditImport(storage, CONFIG, c.files(), NOW, c.year);
      assert.equal(audit.loadable, false);
      assert.match(audit.refusal ?? "", c.refusal);
      assert.deepEqual([audit.changes.counts.created, audit.changes.counts.updated, audit.changes.counts.absent], [0, 0, 0]);
      assert.deepEqual(audit.conflicts, []);
      await assert.rejects(() => loadImport(storage, CONFIG, c.files(), NOW, c.year), (error: Error) => error.message === audit.refusal);
    });
  });
}

test("loadable files: the audit says loadable with no refusal, and so does the load", async () => {
  await withStorage(async (storage) => {
    const audit = await auditImport(storage, CONFIG, files(), NOW);
    assert.deepEqual([audit.loadable, audit.refusal, audit.changes.counts.created], [true, null, 5]);
    const load = await loadImport(storage, CONFIG, files(), NOW);
    assert.deepEqual([load.loadable, load.refusal], [true, null]);
  });
});
