// ADR 060 through the middle, over the synthetic fixtures and a JSONL
// store: a hand correction of the estimé stands while the SP export
// repeats the previous value, and is taken back — said in the report, the
// load figures and the CLI text — when the export brings a new one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BoardStorage } from "../core/ports.ts";
import type { BoardConfig } from "../core/types.ts";
import type { InputFile } from "../adapters/csv-import/index.ts";
import { validateBoardConfig } from "../core/config.ts";
import { lifecycleEvent } from "../core/events.ts";
import { foldEvents } from "../core/state.ts";
import { auditImport, loadImport } from "./import.ts";
import { createJsonlStorage } from "./storage/jsonl.ts";
import { boardText } from "../sync/import-text.ts";

const CONFIG: BoardConfig = validateBoardConfig(
  JSON.parse(readFileSync(new URL("../config/board.json", import.meta.url), "utf8")),
);
const FIXTURES = new URL("../fixtures/import/", import.meta.url);
const ID = "PE10001@2026";

function files(sp?: string): InputFile[] {
  return readdirSync(FIXTURES).filter((name) => name.endsWith(".csv")).map((name) => ({
    name, bytes: new Uint8Array(name === "SP_2026.csv" && sp !== undefined ? Buffer.from(sp, "utf8") : readFileSync(new URL(name, FIXTURES))),
  }));
}

function newSp(): string {
  const text = readFileSync(new URL("SP_2026.csv", FIXTURES), "utf8");
  assert.ok(text.includes("120 500 €;80 000 €"));
  return text.replace("120 500 €;80 000 €", "150 000 €;80 000 €");
}

async function estimated(storage: BoardStorage): Promise<number | null | undefined> {
  const board = foldEvents(await storage.listBaseCards(), await storage.listEvents());
  return board.find((card) => card.id === ID)?.budgetEstimated;
}

test("ADR 060: the hand's estimé stands against a repeat, the export's new estimé takes it back and is said", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kanban-import-newer-"));
  const storage = createJsonlStorage(join(dir, "board.jsonl"));
  try {
    await loadImport(storage, CONFIG, files(), new Date("2026-09-08T09:00:00.000Z"));
    await storage.appendEvent(lifecycleEvent("edited", ID, "pmo", "2026-09-10T09:00:00.000Z", { patch: { budgetEstimated: 130 } }));
    const repeat = await loadImport(storage, CONFIG, files(), new Date("2026-09-12T09:00:00.000Z"));
    assert.deepEqual([repeat.load.replaced, repeat.changes.replaced, repeat.changes.counts.replaced], [0, [], 0]);
    assert.equal(await estimated(storage), 130, "the export repeats 120,5: the hand's 130 stands");
    const audit = await auditImport(storage, CONFIG, files(newSp()), new Date("2026-09-15T09:00:00.000Z"));
    assert.deepEqual(audit.changes.replaced.map((r) => [r.label, r.cards.map((c) => c.cardId)]), [["estimé k€", [ID]]]);
    const loaded = await loadImport(storage, CONFIG, files(newSp()), new Date("2026-09-15T09:00:00.000Z"));
    assert.deepEqual([loaded.load.replaced, loaded.changes.counts.replaced, loaded.load.advanced], [1, 1, 0]);
    assert.equal(await estimated(storage), 150, "the export's new value wins");
    const text = boardText(loaded.changes, CONFIG).join("\n");
    assert.match(text, /Correction manuelle remplacée par la nouvelle valeur de l’export \(ADR 060\) :\n {2}estimé k€ \(1\) : PE10001/);
    const again = await loadImport(storage, CONFIG, files(newSp()), new Date("2026-09-16T09:00:00.000Z"));
    assert.equal(again.load.replaced, 0, "the same files again: nothing written");
  } finally {
    await storage.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
});
