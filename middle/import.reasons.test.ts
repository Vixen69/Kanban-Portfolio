// Why a project enters, leaves or comes back is written in the log (task
// G, ADR 055 note): the `imported`, `unlisted` and `relisted` events of a
// load carry the report's reason in their payload, and the fiche's
// Historique says it. The import CLI takes the automatic snapshot « avant
// chargement <année> » before it writes, like the tool (ADR 042), and says
// the ADR 058/059/060 outcomes. Synthetic fixtures, temporary JSONL stores.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BoardConfig } from "../core/types.ts";
import type { InputFile } from "../adapters/csv-import/index.ts";
import { validateBoardConfig } from "../core/config.ts";
import { cardHistory } from "../core/history.ts";
import { loadImport } from "./import.ts";
import { createJsonlStorage } from "./storage/jsonl.ts";

const CONFIG: BoardConfig = validateBoardConfig(
  JSON.parse(readFileSync(new URL("../config/board.json", import.meta.url), "utf8")),
);
const FIXTURES = new URL("../fixtures/import/", import.meta.url);
const ROOT = fileURLToPath(new URL("..", import.meta.url));

function files(couts?: string): InputFile[] {
  return readdirSync(FIXTURES).filter((name) => name.endsWith(".csv")).map((name) => ({
    name, bytes: new Uint8Array(name === "Couts.csv" && couts !== undefined ? Buffer.from(couts, "utf8") : readFileSync(new URL(name, FIXTURES))),
  }));
}

// The Coût file without PE10002, and PE10003 reported (Reporté: out of the retained states).
function leaving(): string {
  const text = readFileSync(new URL("Couts.csv", FIXTURES), "utf8");
  const from = "Projet ATLAS [Hors PDSI] (Projet);;Basculé en projet";
  assert.ok(text.includes(from));
  return text.replace(from, "Projet ATLAS [Hors PDSI] (Projet);;Reporté").split(/\r?\n/).filter((line) => !line.includes(";PE10002;")).join("\n");
}

test("the log carries why each project entered, left and came back; the Historique says it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kanban-import-reasons-"));
  const storage = createJsonlStorage(join(dir, "board.jsonl"));
  try {
    const first = await loadImport(storage, CONFIG, files(), new Date("2026-09-08T09:00:00.000Z"));
    const imported = (await storage.listEvents()).filter((e) => e.type === "imported");
    assert.deepEqual(imported.map((e) => [e.cardId, e.payload["reason"]]).sort(), first.changes.entered.map((e) => [e.cardId, e.reason]).sort());
    const out = await loadImport(storage, CONFIG, files(leaving()), new Date("2026-09-10T09:00:00.000Z"));
    const unlisted = (await storage.listEvents()).filter((e) => e.type === "unlisted");
    assert.deepEqual(unlisted.map((e) => [e.cardId, e.payload["reason"]]).sort(), out.changes.left.map((l) => [l.cardId, l.reason]).sort());
    assert.deepEqual(unlisted.map((e) => e.payload["reason"]).sort(), [
      "plus présent dans le fichier Coût « Couts.csv »", "écarté du périmètre COUT PREV : état « Reporté » hors des états retenus",
    ]);
    const back = await loadImport(storage, CONFIG, files(), new Date("2026-09-12T09:00:00.000Z"));
    const events = await storage.listEvents();
    const relisted = events.filter((e) => e.type === "relisted");
    assert.deepEqual(relisted.map((e) => [e.cardId, e.payload["reason"]]).sort(), back.changes.back.map((b) => [b.cardId, b.reason]).sort());
    const lines = cardHistory(events, "PE10003@2026", CONFIG).map((h) => [h.kind, h.reason]);
    assert.deepEqual(lines.slice(0, 2), [
      ["relisted", back.changes.back.find((b) => b.cardId === "PE10003@2026")?.reason],
      ["unlisted", "écarté du périmètre COUT PREV : état « Reporté » hors des états retenus"],
    ]);
  } finally {
    await storage.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
});

test("the CLI load takes the snapshot « avant chargement 2026 » before writing, logs the reasons and says the outcomes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kanban-import-cli-"));
  const folder = join(dir, "export");
  mkdirSync(folder);
  for (const file of files()) writeFileSync(join(folder, file.name), file.bytes);
  const dataPath = join(dir, "data", "board.jsonl");
  try {
    const run = spawnSync(process.execPath, ["sync/import.ts", folder, "--charger", "--out", join(dir, "rapport.md")], {
      cwd: ROOT, encoding: "utf8", env: { ...process.env, KANBAN_DATA_PATH: dataPath, KANBAN_STORAGE_DRIVER: "jsonl" },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /adoptées \(saisies à la main\) : 0 · supprimées du tableau, ignorées : 0 · doutes d'identité : 0 · en pause, jalon non appliqué : 0/);
    const storage = createJsonlStorage(dataPath);
    try {
      const snapshots = await storage.listSnapshots();
      assert.deepEqual(snapshots.map((s) => [s.label, s.actor, s.cardCount, s.logSeq]), [["avant chargement 2026", "import-csv", 0, 0]], "taken before the first write");
      const imported = (await storage.listEvents()).filter((e) => e.type === "imported");
      assert.ok(imported.length > 0 && imported.every((e) => typeof e.payload["reason"] === "string"));
    } finally {
      await storage.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
});
