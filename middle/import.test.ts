// Import from the tool (ADR 027): the shared secret, the body screening,
// the audit and the load over the synthetic fixtures, and the HTTP routes
// (403 without or with a wrong secret, the 40 MB cap confined to them).

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
import { auditImport, checkSecret, Forbidden, loadImport, parseFiles } from "./import.ts";
import { createJsonlStorage } from "./storage/jsonl.ts";

const CONFIG: BoardConfig = validateBoardConfig(
  JSON.parse(readFileSync(new URL("../config/board.json", import.meta.url), "utf8")),
);
const NOW = new Date("2026-09-08T09:00:00.000Z");
const FIXTURES = new URL("../fixtures/import/", import.meta.url);

function fixtureFiles(names?: string[]): InputFile[] {
  const all = readdirSync(FIXTURES).filter((name) => name.endsWith(".csv"));
  return (names ?? all).map((name) => ({ name, bytes: new Uint8Array(readFileSync(new URL(name, FIXTURES))) }));
}

function payload(files: InputFile[]): { files: Array<{ name: string; base64: string }> } {
  return { files: files.map((f) => ({ name: f.name, base64: Buffer.from(f.bytes).toString("base64") })) };
}

async function withTempDir(work: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "kanban-import-"));
  try {
    await work(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("checkSecret: disabled without configuration, refuses absent or wrong, accepts the right one", () => {
  assert.throws(() => checkSecret(null, "x"), (e: unknown) => e instanceof Forbidden && /désactivé/.test(e.message));
  assert.throws(() => checkSecret("s3cret", undefined), /requis/);
  assert.throws(() => checkSecret("s3cret", ""), /requis/);
  assert.throws(() => checkSecret("s3cret", "s3cre"), /invalide/);
  assert.throws(() => checkSecret("s3cret", "S3CRET"), /invalide/);
  assert.doesNotThrow(() => checkSecret("s3cret", "s3cret"));
});

test("parseFiles screens the body: list, count, names, content", () => {
  assert.throws(() => parseFiles({}), /Aucun fichier/);
  assert.throws(() => parseFiles({ files: [] }), /Aucun fichier/);
  assert.throws(() => parseFiles({ files: Array.from({ length: 13 }, () => ({ name: "a.csv", base64: "YQ==" })) }), /Trop de fichiers/);
  assert.throws(() => parseFiles({ files: [42] }), /Fichier 1 invalide/);
  assert.throws(() => parseFiles({ files: [{ name: "", base64: "YQ==" }] }), /nom manquant/);
  assert.throws(() => parseFiles({ files: [{ name: "a.csv" }] }), /contenu manquant/);
  assert.throws(() => parseFiles({ files: [{ name: "a.csv", base64: "" }] }), /vide ou illisible/);
  const [file] = parseFiles({ files: [{ name: "C:\\exports\\..\\Projets.csv", base64: Buffer.from("Id;Nom\n").toString("base64") }] });
  assert.equal(file?.name, "Projets.csv");
  assert.equal(Buffer.from(file?.bytes ?? []).toString("utf8"), "Id;Nom\n");
});

test("auditImport over the synthetic fixtures renders the CLI's report and its counts", () => {
  const result = auditImport(CONFIG, fixtureFiles(), NOW);
  assert.deepEqual([result.summary.received, result.summary.recognized, result.summary.missing, result.loadable], [6, 6, [], true]);
  assert.equal(result.summary.taken, 6);
  assert.match(result.report, /capacité : 5 personne\(s\)/);
  const partial = auditImport(CONFIG, fixtureFiles(["PARAM.csv"]), NOW);
  assert.equal(partial.loadable, false);
  assert.ok(partial.summary.missing.includes("Projets"));
});

test("loadImport writes the deck and the capacity; a second load updates; no perimeter refuses", async () => {
  await withTempDir(async (dir) => {
    const storage = createJsonlStorage(join(dir, "board.jsonl"));
    try {
      const first = await loadImport(storage, CONFIG, fixtureFiles(), NOW);
      assert.deepEqual([first.load.created, first.load.updated, first.load.unlisted], [6, 0, 0]);
      assert.deepEqual(first.load.capacity, { persons: 5, assignments: 3 });
      assert.equal((await storage.listBaseCards()).length, 6);
      assert.equal((await storage.getCapacity())?.persons.length, 5);
      const second = await loadImport(storage, CONFIG, fixtureFiles(), new Date("2026-09-09T09:00:00.000Z"));
      assert.deepEqual([second.load.created, second.load.updated], [0, 6]);
      await assert.rejects(() => loadImport(storage, CONFIG, fixtureFiles(["PARAM.csv"]), NOW), /aucune carte assemblée/);
    } finally {
      await storage.close();
    }
  });
});

async function withImportServer(
  importSecret: string | null, work: (base: string) => Promise<void>,
): Promise<void> {
  await withTempDir(async (dir) => {
    const storage = createJsonlStorage(join(dir, "board.jsonl"));
    const configStore = createConfigStore(dir, CONFIG);
    const app = createApp({ storage, configStore, importSecret });
    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const { port } = server.address() as AddressInfo;
    try {
      await work(`http://127.0.0.1:${port}`);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await storage.close();
    }
  });
}

function post(base: string, path: string, body: unknown, secret?: string): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== undefined) headers["x-import-secret"] = secret;
  return fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

test("the import routes answer 403 when disabled, without secret, or with a wrong one", async () => {
  await withImportServer(null, async (base) => {
    const res = await post(base, "/api/import/audit", payload(fixtureFiles(["PARAM.csv"])), "x");
    assert.equal(res.status, 403);
    assert.match(((await res.json()) as { error: string }).error, /désactivé/);
  });
  await withImportServer("s3cret", async (base) => {
    assert.equal((await post(base, "/api/import/audit", payload(fixtureFiles(["PARAM.csv"])))).status, 403);
    assert.equal((await post(base, "/api/import/load", payload(fixtureFiles(["PARAM.csv"])), "wrong")).status, 403);
  });
});

test("with the secret, audit answers the report and load writes the deck; the 40 MB cap is theirs alone", async () => {
  await withImportServer("s3cret", async (base) => {
    const audit = await post(base, "/api/import/audit", payload(fixtureFiles()), "s3cret");
    assert.equal(audit.status, 200);
    const body = (await audit.json()) as { loadable: boolean; summary: { received: number } };
    assert.deepEqual([body.loadable, body.summary.received], [true, 6]);
    const load = await post(base, "/api/import/load", payload(fixtureFiles()), "s3cret");
    assert.equal(load.status, 200);
    assert.equal(((await load.json()) as { load: { created: number } }).load.created, 6);
    assert.equal((await (await fetch(`${base}/api/board`)).json() as { cards: unknown[] }).cards.length, 6);
    // A 100 KB file passes the import cap; the same body on /api/events is 413.
    const big = { files: [{ name: "gros.csv", base64: Buffer.alloc(100 * 1024, "a").toString("base64") }] };
    assert.equal((await post(base, "/api/import/audit", big, "s3cret")).status, 200);
    assert.equal((await post(base, "/api/events", big)).status, 413);
    const bad = await post(base, "/api/import/audit", { files: [] }, "s3cret");
    assert.equal(bad.status, 400);
  });
});
