// ADR 056 through the middle: a drop the importer refuses (two files of
// one kind) previews nothing and loads nothing; a rename in ⚙ ›
// Catégories changes neither the perimeter nor the domains of identical
// files, over HTTP.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { BoardConfig } from "../core/types.ts";
import type { InputFile } from "../adapters/csv-import/index.ts";
import { validateBoardConfig } from "../core/config.ts";
import { createApp } from "./app.ts";
import { createConfigStore } from "./config-store.ts";
import { auditImport, loadImport } from "./import.ts";
import { createJsonlStorage } from "./storage/jsonl.ts";

const CONFIG: BoardConfig = validateBoardConfig(JSON.parse(readFileSync(new URL("../config/board.json", import.meta.url), "utf8")));
const NOW = new Date("2026-09-30T09:00:00.000Z");
const FIXTURES = new URL("../fixtures/import/", import.meta.url);

function fixtureFiles(): InputFile[] {
  return readdirSync(FIXTURES).filter((name) => name.endsWith(".csv"))
    .map((name) => ({ name, bytes: new Uint8Array(readFileSync(new URL(name, FIXTURES))) }));
}

async function withTempDir(work: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "kanban-import-056-"));
  try {
    await work(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("two Coût exports: the audit says « chargement impossible » and previews nothing, the load is refused with both names", async () => {
  await withTempDir(async (dir) => {
    const storage = createJsonlStorage(join(dir, "board.jsonl"));
    try {
      const files = fixtureFiles();
      const couts = files.find((f) => f.name === "Couts.csv");
      assert.ok(couts);
      const drop = [...files, { name: "Couts (1).csv", bytes: couts.bytes }];
      const audit = await auditImport(storage, CONFIG, drop, NOW);
      assert.equal(audit.loadable, false);
      assert.deepEqual(audit.changes.entered, []);
      await assert.rejects(loadImport(storage, CONFIG, drop, NOW),
        /Chargement refusé : Deux fichiers Coût : « Couts \(1\)\.csv » et « Couts\.csv » — n'en déposer qu'un\.$/);
      assert.equal((await storage.listEvents()).length, 0, "nothing written");
    } finally {
      await storage.close();
    }
  });
});

// What ⚙ › Catégories allows: names and shorts of types and domains.
function renamed(): BoardConfig {
  return {
    ...CONFIG,
    types: CONFIG.types.map((t) => (t.id === "mise_en_oeuvre" ? { ...t, name: "Mise en œuvre", short: "MOE" } : t)),
    domains: CONFIG.domains.map((d) => (d.id === "infra" ? { ...d, name: "Infrastructures", short: "IFS" } : d)),
  };
}

test("over HTTP, a rename in ⚙ › Catégories leaves the perimeter and the domains of identical files alone", async () => {
  await withTempDir(async (dir) => {
    const storage = createJsonlStorage(join(dir, "board.jsonl"));
    const configStore = createConfigStore(dir, CONFIG);
    const app = createApp({ storage, configStore });
    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const body = JSON.stringify({ files: fixtureFiles().map((f) => ({ name: f.name, base64: Buffer.from(f.bytes).toString("base64") })) });
    const post = async (path: string): Promise<{ load: { created: number; unlisted: number } }> =>
      (await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body })).json() as never;
    try {
      assert.equal((await post("/api/import/load")).load.created, 5);
      const before = (await storage.listBaseCards()).map((c) => `${c.id}|${c.domain}`).sort();
      configStore.setRuntime(renamed(), "test");
      const again = await post("/api/import/load");
      assert.deepEqual([again.load.created, again.load.unlisted], [0, 0], "no card absent, none created");
      assert.deepEqual((await storage.listBaseCards()).map((c) => `${c.id}|${c.domain}`).sort(), before);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await storage.close();
    }
  });
});
