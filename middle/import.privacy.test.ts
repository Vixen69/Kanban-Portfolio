// ADR 062, « Données personnelles » (CLAUDE.md §4/§6: names never enter
// card_events): no value derived from a person's name reaches the log
// through the « Doutes à trancher ». An unkeyed hash of a name is
// reversible with a staff list, so the option ids, the fingerprints and
// the trace words of a `settled` event carry neither a name nor its hash.
// The ProjetsCdP duplicate (options told apart by name only) is asked at
// each import, never remembered; the Projets duplicate rows are
// identified without their Responsable cells.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BoardConfig, CardEvent } from "../core/types.ts";
import type { ImportChoice, ImportDoubt } from "../core/import-types.ts";
import { validateBoardConfig } from "../core/config.ts";
import { fnv1a } from "../adapters/csv-import/hash.ts";
import { normalizeLabel } from "../adapters/csv-import/normalize.ts";
import { coutsRow, sampleFiles, SAMPLE_CONFIG } from "../adapters/csv-import/test-samples.ts";
import { auditImport, loadImport } from "./import.ts";
import { createJsonlStorage } from "./storage/jsonl.ts";
import type { BoardStorage } from "../core/ports.ts";

const CONFIG: BoardConfig = validateBoardConfig(SAMPLE_CONFIG);
const NOW = new Date("2026-09-30T09:00:00.000Z");
const NAMES = ["MARTIN Eva", "DURAND Luc", "BLANC Paul", "NOIR Anne"];
const cdpRow = (id: string, owner: string) => ({ "Id": id, "Nom": "Socle réseau", "Responsable 1": owner });
const projetsRow = (id: string, nom: string, owner: string) =>
  ({ "Id": id, "Nom": nom, "Type": "Etude (Opportunité)", "Domaine (Orga)": "INFRA", "État du processus": "Nouveau", "Responsable 1": owner });

async function withBoard(work: (storage: BoardStorage) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "kanban-privacy-"));
  const storage = createJsonlStorage(join(dir, "board.jsonl"));
  try {
    await work(storage);
  } finally {
    await storage.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
}

// Every string a name could leave in the log: the name as written, trimmed,
// normalized, upper case — and the 8-hex fingerprint of each.
function nameTraces(): string[] {
  const forms = NAMES.flatMap((name) => [name, normalizeLabel(name), name.toUpperCase(), name.split(" ")[0] ?? name]);
  return [...forms, ...forms.map(fnv1a)];
}

function assertNoName(events: readonly CardEvent[]): void {
  const text = JSON.stringify(events);
  for (const trace of nameTraces()) assert.ok(!text.includes(trace), `the log carries « ${trace} »`);
}

const doubtOf = (doubts: ImportDoubt[] | undefined, id: string): ImportDoubt => {
  const doubt = doubts?.find((d) => d.id === id);
  assert.ok(doubt !== undefined, `doubt ${id} raised`);
  return doubt;
};
const choice = (id: string, option: string): { choices: Map<string, ImportChoice> } => ({ choices: new Map([[id, { option, sticky: true }]]) });

test("ProjetsCdP: options by line number, asked at each import, a sticky answer never remembered, no name in the log", async () => {
  const id = "duplicate-row|2026|PE20001|cdp";
  const files = sampleFiles({ couts: [coutsRow("PE20001", "Socle réseau")], cdp: [cdpRow("PE20001", "MARTIN Eva"), cdpRow("PE20001", "DURAND Luc")] });
  await withBoard(async (storage) => {
    const doubt = doubtOf((await auditImport(storage, CONFIG, files, NOW)).doubts, id);
    assert.equal(doubt.askedEachTime, true);
    assert.ok(doubt.options.every((o) => /^ligne:\d+$/.test(o.id)), doubt.options.map((o) => o.id).join(", "));
    assert.ok(doubt.options.some((o) => /MARTIN Eva/.test(o.label)), "the PMO still reads the names");
    const martin = doubt.options.find((o) => /MARTIN/.test(o.label))?.id ?? "?";
    const load = await loadImport(storage, CONFIG, files, NOW, 2026, choice(id, martin));
    assert.equal(load.load.settled, 1);
    assert.equal((await storage.listBaseCards()).find((c) => c.codename === "PE20001")?.owner, "MARTIN Eva", "the choice applied");
    const events = await storage.listEvents();
    const settled = events.filter((e) => e.type === "settled");
    assert.deepEqual(settled.map((e) => [e.payload["option"], e.payload["sticky"], e.payload["label"]]), [[martin, false, martin.replace(":", " ")]]);
    assertNoName(events);
    const next = doubtOf((await auditImport(storage, CONFIG, files, NOW)).doubts, id);
    assert.deepEqual([next.how, next.remembered, next.applied], ["proposé", null, next.proposed], "asked again at the next import");
  });
});

test("Projets duplicate rows: the option ids and the fingerprint leave the Responsable cells out", async () => {
  const id = "duplicate-row|2026|PE30001|projets";
  const files = (a: string, b: string) => sampleFiles({ projets: [projetsRow("PE30001", "Alpha bis", a), projetsRow("PE30001", "Alpha", b)] });
  await withBoard(async (storage) => {
    const first = doubtOf((await auditImport(storage, CONFIG, files("MARTIN Eva", "DURAND Luc"), NOW)).doubts, id);
    const other = doubtOf((await auditImport(storage, CONFIG, files("BLANC Paul", "NOIR Anne"), NOW)).doubts, id);
    assert.deepEqual([other.options.map((o) => o.id), other.fingerprint], [first.options.map((o) => o.id), first.fingerprint], "names change nothing");
    assert.equal(first.askedEachTime, undefined, "told apart by their names: remembered as before");
    const bis = first.options.find((o) => /Alpha bis/.test(o.label))?.id ?? "?";
    await loadImport(storage, CONFIG, files("MARTIN Eva", "DURAND Luc"), NOW, 2026, choice(id, bis));
    const events = await storage.listEvents();
    assert.equal(events.filter((e) => e.type === "settled").length, 1);
    assertNoName(events);
    assert.equal(doubtOf((await auditImport(storage, CONFIG, files("MARTIN Eva", "DURAND Luc"), NOW)).doubts, id).how, "mémorisé");
  });
});

test("Projets rows differing only in their Responsables: by line number, asked at each import, no name in the log", async () => {
  const id = "duplicate-row|2026|PE30001|projets";
  const files = sampleFiles({ projets: [projetsRow("PE30001", "Alpha", "MARTIN Eva"), projetsRow("PE30001", "Alpha", "DURAND Luc")] });
  await withBoard(async (storage) => {
    const doubt = doubtOf((await auditImport(storage, CONFIG, files, NOW)).doubts, id);
    assert.equal(doubt.askedEachTime, true);
    assert.ok(doubt.options.every((o) => /^ligne:\d+$/.test(o.id)));
    const other = doubt.options.find((o) => o.id !== doubt.proposed)?.id ?? "?";
    await loadImport(storage, CONFIG, files, NOW, 2026, choice(id, other));
    const events = await storage.listEvents();
    assert.deepEqual(events.filter((e) => e.type === "settled").map((e) => e.payload["sticky"]), [false]);
    assertNoName(events);
    assert.equal(doubtOf((await auditImport(storage, CONFIG, files, NOW)).doubts, id).how, "proposé");
  });
});
