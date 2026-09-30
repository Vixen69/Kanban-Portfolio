// ADR 062 end to end over a JSONL board: the audit lists the « Doutes à
// trancher », a load applies the choices sent and traces each in the log
// (a `settled` event, same batch); « ne plus me demander » is reapplied
// silently while the doubt is the same, a changed doubt, a choice for
// this load only, a « Redemander » and a restore all ask again; an unknown
// doubt or option is a French 400; the CLI applies the memory.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { BoardConfig } from "../core/types.ts";
import type { ImportChoice, ImportDoubt } from "../core/import-types.ts";
import { lifecycleEvent } from "../core/events.ts";
import { validateBoardConfig } from "../core/config.ts";
import { eventSequence } from "../core/event-sequence.ts";
import type { InputFile } from "../adapters/csv-import/index.ts";
import { coutsRow, sampleFiles, SAMPLE_CONFIG } from "../adapters/csv-import/test-samples.ts";
import { auditImport, loadImport } from "./import.ts";
import { parseChoices } from "./import-choices.ts";
import { createJsonlStorage } from "./storage/jsonl.ts";
import { createApp } from "./app.ts";
import { createConfigStore } from "./config-store.ts";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { BoardStorage } from "../core/ports.ts";

const CONFIG: BoardConfig = validateBoardConfig(SAMPLE_CONFIG);
const NOW = new Date("2026-09-30T09:00:00.000Z");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ID = "couts-fact|2026|PE20001|etat";
const SOCLE = coutsRow("PE20001", "Socle réseau");
const PRESENTE = coutsRow("PE20001", "Socle réseau", { "Projet.Etat du processus": "Budget présenté" });

function files(third = PRESENTE): InputFile[] {
  return sampleFiles({ couts: [SOCLE, SOCLE, third, coutsRow("PE20003", "Réseau campus")] });
}

async function withBoard(work: (storage: BoardStorage, dataPath: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "kanban-doubts-"));
  const dataPath = join(dir, "board.jsonl");
  const storage = createJsonlStorage(dataPath);
  try {
    await work(storage, dataPath);
  } finally {
    await storage.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
}

const doubtOf = (doubts: ImportDoubt[] | undefined): ImportDoubt | undefined => doubts?.find((d) => d.id === ID);
const optionFor = (doubt: ImportDoubt | undefined, label: RegExp): string => doubt?.options.find((o) => label.test(o.label))?.id ?? "?";
const choices = (entries: Array<[string, ImportChoice]>): { choices: Map<string, ImportChoice> } => ({ choices: new Map(entries) });

test("parseChoices checks the shape: option + sticky, or forget; anything else is a French 400", () => {
  assert.deepEqual([...parseChoices({})], []);
  assert.deepEqual([...parseChoices({ choices: { a: { option: "x", sticky: true }, b: { option: "y" }, c: { forget: true } } })],
    [["a", { option: "x", sticky: true }], ["b", { option: "y", sticky: false }], ["c", { forget: true }]]);
  assert.throws(() => parseChoices({ choices: [] }), /Choix des doutes invalides/);
  assert.throws(() => parseChoices({ choices: { a: "x" } }), /Choix invalide pour le doute « a »/);
  assert.throws(() => parseChoices({ choices: { a: { sticky: true } } }), /option manquante/);
  assert.throws(() => parseChoices({ choices: { a: { option: "x", sticky: "oui" } } }), /vrai ou faux/);
});

test("the audit lists the doubt; a load without choices applies the proposal and traces nothing", async () => {
  await withBoard(async (storage) => {
    const audit = await auditImport(storage, CONFIG, files(), NOW);
    assert.deepEqual([doubtOf(audit.doubts)?.how, audit.changes.settled], ["proposé", []]);
    const load = await loadImport(storage, CONFIG, files(), NOW);
    assert.deepEqual([load.load.created, load.load.settled], [2, 0]);
    assert.equal((await storage.listEvents()).filter((e) => e.type === "settled").length, 0, "« tant que tu n'as pas cliqué, on te redemandera »");
  });
});

test("a sticky choice is applied, traced in the load's batch, then reapplied silently while the doubt is the same", async () => {
  await withBoard(async (storage) => {
    const audit = await auditImport(storage, CONFIG, files(), NOW);
    const presente = optionFor(doubtOf(audit.doubts), /présenté/);
    const preview = await auditImport(storage, CONFIG, files(), NOW, 2026, new Map([[ID, { option: presente, sticky: true }]]));
    assert.deepEqual(preview.changes.entered.map((e) => e.code), ["PE20003"], "the audit previews a choice without writing");
    assert.equal((await storage.listEvents()).length, 0);
    const load = await loadImport(storage, CONFIG, files(), NOW, 2026, choices([[ID, { option: presente, sticky: true }]]));
    assert.deepEqual([load.load.created, load.load.settled, doubtOf(load.doubts)?.how], [1, 1, "choisi"]);
    assert.deepEqual(load.changes.settled?.map((s) => [s.code, s.how]), [["PE20001", "choisi"]]);
    assert.match(load.changes.perimeter.excluded.find((e) => e.code === "PE20001")?.settledBy ?? "", /Budget présenté/);
    const events = await storage.listEvents();
    const settled = events.filter((e) => e.type === "settled");
    assert.deepEqual(settled.map((e) => [e.cardId, e.actor, e.payload["doubtId"], e.payload["option"], e.payload["sticky"], e.payload["label"]]),
      [["PE20001@2026", "anonymous", ID, presente, true, "« Budget présenté » — 1 ligne(s)"]]);
    assert.ok(eventSequence(settled[0]?.id ?? "") > Math.max(...events.filter((e) => e.type === "imported").map((e) => eventSequence(e.id))), "same batch, after the load's events");
    const next = await auditImport(storage, CONFIG, files(), NOW);
    assert.deepEqual([doubtOf(next.doubts)?.how, doubtOf(next.doubts)?.applied, doubtOf(next.doubts)?.remembered?.option], ["mémorisé", presente, presente]);
    assert.deepEqual(next.changes.entered, [], "still out of the perimeter, nothing asked");
    const again = await loadImport(storage, CONFIG, files(), NOW);
    assert.deepEqual([again.load.created, again.load.settled], [0, 0], "reapplied silently, nothing written");
  });
});

test("a changed doubt, a choice for this load only, « Redemander » and a restore all ask again", async () => {
  await withBoard(async (storage) => {
    const first = await auditImport(storage, CONFIG, files(), NOW);
    const presente = optionFor(doubtOf(first.doubts), /présenté/);
    const sticky = choices([[ID, { option: presente, sticky: true }]]);
    await loadImport(storage, CONFIG, files(), NOW, 2026, sticky);
    const changed = await auditImport(storage, CONFIG, files(coutsRow("PE20001", "Socle réseau", { "Projet.Etat du processus": "Reporté" })), NOW);
    assert.deepEqual([doubtOf(changed.doubts)?.how, doubtOf(changed.doubts)?.remembered], ["proposé", null], "other competing values: asked again");
    await loadImport(storage, CONFIG, files(), NOW, 2026, choices([[ID, { forget: true }]]));
    const forgotten = (await storage.listEvents()).filter((e) => e.type === "settled").at(-1);
    assert.deepEqual([forgotten?.payload["forget"], forgotten?.payload["sticky"]], [true, false]);
    assert.equal(doubtOf((await auditImport(storage, CONFIG, files(), NOW)).doubts)?.how, "proposé", "« Redemander »");
    await loadImport(storage, CONFIG, files(), NOW, 2026, choices([[ID, { option: presente, sticky: false }]]));
    assert.equal(doubtOf((await auditImport(storage, CONFIG, files(), NOW)).doubts)?.how, "proposé", "this load only");
    const before = Math.max(...(await storage.listEvents()).map((e) => eventSequence(e.id)));
    await loadImport(storage, CONFIG, files(), NOW, 2026, sticky);
    assert.equal(doubtOf((await auditImport(storage, CONFIG, files(), NOW)).doubts)?.how, "mémorisé");
    await storage.appendEvent({ ...lifecycleEvent("restored", "*", "pmo", NOW.toISOString(), { toSeq: before }) });
    assert.equal(doubtOf((await auditImport(storage, CONFIG, files(), NOW)).doubts)?.how, "proposé", "a restore forgets the later choice");
  });
});

test("an unknown doubt or option refuses the load in French, before anything is written", async () => {
  await withBoard(async (storage) => {
    await assert.rejects(() => loadImport(storage, CONFIG, files(), NOW, 2026, choices([["inconnu", { forget: true }]])), /^Error: Doute inconnu « inconnu »/);
    await assert.rejects(() => loadImport(storage, CONFIG, files(), NOW, 2026, choices([[ID, { option: "v:zz", sticky: true }]])), /Choix « v:zz » inconnu pour « Socle réseau »/);
    await assert.rejects(() => auditImport(storage, CONFIG, files(), NOW, 2026, new Map([["inconnu", { forget: true }]])), /Doute inconnu/);
    assert.equal((await storage.listEvents()).length, 0);
  });
});

test("the CLI applies the remembered choice and says it", async () => {
  await withBoard(async (storage, dataPath) => {
    const audit = await auditImport(storage, CONFIG, files(), NOW);
    await loadImport(storage, CONFIG, files(), NOW, 2026, choices([[ID, { option: optionFor(doubtOf(audit.doubts), /présenté/), sticky: true }]]));
    await storage.close();
    const folder = join(dataPath, "..", "export");
    mkdirSync(folder);
    for (const file of files()) writeFileSync(join(folder, file.name), file.bytes);
    const run = spawnSync(process.execPath, ["sync/import.ts", folder, "--comparer", "--out", join(folder, "..", "rapport.md")], {
      cwd: ROOT, encoding: "utf8", env: { ...process.env, KANBAN_DATA_PATH: dataPath, KANBAN_STORAGE_DRIVER: "jsonl" },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Doutes à trancher : 1 \(dont 1 déjà tranché\(s\), mémorisé\(s\)\)/);
    assert.match(run.stdout, /tranché : « Budget présenté » — 1 ligne\(s\) \(mémorisé\) — le projet sort du périmètre/);
    const audited = spawnSync(process.execPath, ["sync/import.ts", folder, "--out", join(folder, "..", "rapport.md")], {
      cwd: ROOT, encoding: "utf8", env: { ...process.env, KANBAN_DATA_PATH: dataPath, KANBAN_STORAGE_DRIVER: "jsonl" },
    });
    assert.match(audited.stdout, /tranché : « Budget validé » — 2 ligne\(s\) \(proposé par l'outil\)/, "audit mode reads no board: the proposals");
  });
});

test("the routes take the choices: the audit previews, the load traces, an unknown doubt is a 400", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kanban-doubts-http-"));
  const storage = createJsonlStorage(join(dir, "board.jsonl"));
  const server: Server = await new Promise((resolve) => {
    const s = createApp({ storage, configStore: createConfigStore(dir, CONFIG) }).listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown): Promise<Response> =>
    fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const body = (extra: object) => ({ files: files().map((f) => ({ name: f.name, base64: Buffer.from(f.bytes).toString("base64") })), ...extra });
  try {
    const audit = (await (await post("/api/import/audit", body({}))).json()) as { doubts: ImportDoubt[] };
    const option = optionFor(doubtOf(audit.doubts), /présenté/);
    const bad = await post("/api/import/load", body({ choices: { inconnu: { forget: true } } }));
    assert.equal(bad.status, 400);
    assert.match(((await bad.json()) as { error: string }).error, /Doute inconnu/);
    const load = await post("/api/import/load", body({ choices: { [ID]: { option, sticky: true } } }));
    assert.equal(load.status, 200);
    assert.equal(((await load.json()) as { load: { settled: number } }).load.settled, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await storage.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
});
