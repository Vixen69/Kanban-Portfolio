// ADR 056 on the COUT PREV reader: the same rows in any order give the
// same perimeter, domains and titles; the exercise-year rows speak; rows
// of one Id that disagree are a douteux; « arbitrage » is a whole word;
// an unreadable ME cell is never a silent zero; « Année » is read
// whatever its rendering. Synthetic rows on the fixture's header.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { runImportAudit } from "./orchestrate.ts";
import type { AuditResult } from "./orchestrate.ts";

const CONFIG = JSON.parse(readFileSync(new URL("../../config/board.json", import.meta.url), "utf8")) as BoardConfig;
const NOW = new Date("2026-09-30T12:00:00.000Z");
const HEADER = (readFileSync(new URL("../../fixtures/import/Couts.csv", import.meta.url), "utf8").split(/\r?\n/)[0] ?? "").split(";");

interface Row {
  year?: string;
  id: string;
  name: string;
  portfolio?: string;
  type?: string;
  etat?: string;
  me?: string;
  exported?: string;
}

// One COUT PREV line on the fixture's header (24 columns).
function line(r: Row): string {
  const values: Record<string, string> = {
    "Fichier": "Coût prévisionnel", "Année": r.year ?? "2026", "Type de centre de coût": "Prestation",
    "Coût final ME (Res ouTrans)": r.me ?? "1 000,00 €", "Projet. Id": r.id, "Projet. Nom": r.name,
    "Projet.Portefeuille": r.portfolio ?? "DSI NEXTER.INFRASTRUCTURE OPE", "Projet.Type": r.type ?? "Etude (Projet)",
    "Projet.Etat du processus": r.etat ?? "Budget validé", "Projet.Actif": "VRAI", "Date d'export": r.exported ?? "10/09/2026",
  };
  return HEADER.map((column) => values[column] ?? "").join(";");
}

function couts(rows: readonly Row[] | readonly string[], name = "Couts.csv"): AuditResult {
  const body = rows.map((r) => (typeof r === "string" ? r : line(r)));
  return runImportAudit([{ name, bytes: Buffer.from([HEADER.join(";"), ...body].join("\n"), "utf8") }], CONFIG, NOW);
}

function ids(result: AuditResult): string[] {
  return (result.couts?.entries ?? []).map((e) => e.id).sort();
}

const DISAGREEING: Row[] = [
  { id: "PE20001", name: "Socle réseau" },
  { id: "PE20001", name: "Socle réseau", year: "2025" },
  { id: "PE20009", name: "Refonte GED", etat: "Budget présenté", year: "2025" },
  { id: "PE20009", name: "Refonte GED", etat: "Budget validé" },
  { id: "PE20010", name: "Portail achats", exported: "09/09/2026" },
  { id: "PE20010", name: "Portail achats v2", exported: "10/09/2026" },
  { id: "PE20011", name: "Stockage", portfolio: "DSI NEXTER.INFRASTRUCTURE OPE" },
  { id: "PE20011", name: "Stockage", portfolio: "DSI NEXTER.CORPORATE.ACHATS" },
  { id: "PE20011", name: "Stockage", portfolio: "DSI NEXTER.CORPORATE.ACHATS" },
  { id: "PE20012", name: "Serveurs", type: "Achat (Projet)" },
  { id: "PE20012", name: "Serveurs", type: "Etude (Projet)" },
];

// A seeded shuffle (mulberry32): the test is reproducible.
function shuffled<T>(items: readonly T[], seed: number): T[] {
  let a = seed;
  const random = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

function fingerprint(result: AuditResult): string {
  const entries = (result.couts?.entries ?? []).map((e) => [e.id, e.title, e.typeId, e.state, e.domainId, e.subDomainId].join("|")).sort();
  const verdicts = (result.couts?.verdicts ?? []).map((v) => `${v.code}|${v.motive}|${v.reason}`).sort();
  const doubts = result.report.doubtful.map((d) => d.question).filter((q) => q.startsWith("Id ")).sort();
  return JSON.stringify({ entries, verdicts, doubts });
}

test("50 row shuffles of a file whose Ids disagree give the same perimeter, domains, titles and douteux", () => {
  const reference = fingerprint(couts(DISAGREEING));
  for (let seed = 1; seed <= 50; seed++) assert.equal(fingerprint(couts(shuffled(DISAGREEING, seed))), reference, `seed ${seed}`);
  const result = couts(DISAGREEING);
  assert.deepEqual(ids(result), ["PE20001", "PE20009", "PE20010", "PE20011"], "PE20012: « Achat » ×1 / « Etude » ×1 → Achat (string order), excluded");
  const byId = new Map((result.couts?.entries ?? []).map((e) => [e.id, e]));
  assert.equal(byId.get("PE20010")?.title, "Portail achats v2", "the tie goes to the most recent export");
  assert.deepEqual([byId.get("PE20011")?.domainId, byId.get("PE20011")?.subDomainId], ["corporate", "achats"], "the most frequent portfolio");
});

test("the exercise-year rows speak; a disagreement names the Id and the competing values, even across years", () => {
  const result = couts(DISAGREEING);
  const questions = result.report.doubtful.map((d) => d.question);
  const ged = questions.find((q) => q.startsWith("Id « PE20009 »")) ?? "";
  assert.match(ged, /état « Budget présenté » ×1 \/ « Budget validé » ×1 → « Budget validé »/);
  assert.match(ged, /sur les lignes 2026/);
  assert.ok(questions.some((q) => /^Id « PE20012 » .*type « Achat \(Projet\) » ×1 \/ « Etude \(Projet\) » ×1 → « Achat \(Projet\) »/.test(q)),
    "an excluded project's disagreement is said too");
  assert.ok(!questions.some((q) => q.startsWith("Id « PE20001 »")), "rows that agree raise nothing");
});

test("« arbitrage » is a whole word of the name: « d'arbitrage » and « Arbitrages » go, « arbitragiste » stays", () => {
  const result = couts([
    { id: "PE30001", name: "Outil d'arbitrage capacitaire" }, { id: "PE30002", name: "Arbitrages RDLI 2026" },
    { id: "PE30003", name: "Portail arbitragiste" }, { id: "PE30004", name: "Arbitrage RDLI INFRA" },
  ]);
  assert.deepEqual(ids(result), ["PE30003"]);
  assert.equal(result.couts?.stats.excluded.arbitrage, 3);
});

test("an unreadable ME cell keeps the project as a douteux; an accounting dash is zero; en-US figures are figures", () => {
  const result = couts([
    { id: "PE40001", name: "Illisible", me: "#REF!" },
    { id: "PE40002", name: "Tiret comptable", me: "- €" },
    { id: "PE40003", name: "Anglais", me: "€1,234.50" },
    { id: "PE40004", name: "Parenthèses", me: "(1 234,50 €)" },
  ]);
  assert.deepEqual(ids(result), ["PE40001", "PE40003", "PE40004"]);
  const questions = result.report.doubtful.map((d) => d.question);
  assert.ok(questions.some((q) => /projets gardés sur une cellule ME illisible \(ni vide ni zéro\) : 1 — codes : PE40001/.test(q)));
  assert.ok(questions.some((q) => /sans aucun chiffre ME .* : 1 — codes : PE40002/.test(q)));
  assert.ok(result.report.warnings.some((w) => /tiret comptable lu comme zéro/.test(w.message)));
});

test("« Année » is read whatever its rendering; the values seen are listed, an unreadable one is a douteux", () => {
  const result = couts([
    { id: "PE50001", name: "Un", year: "2 026" }, { id: "PE50002", name: "Deux", year: "2026,00" },
    { id: "PE50003", name: "Trois", year: "01/01/2026" }, { id: "PE50004", name: "Quatre", year: "2,026" },
    { id: "PE50005", name: "Cinq", year: "2025" }, { id: "PE50006", name: "Six", year: "vingt-six" },
  ]);
  assert.deepEqual(ids(result), ["PE50001", "PE50002", "PE50003", "PE50004"]);
  assert.ok(result.report.warnings.some((w) => w.message === "valeurs d'« Année » lues : 2026 (4) · 2025 (1)"));
  assert.ok(result.report.doubtful.some((d) => /^« Année » illisible : 1 cellule\(s\), ligne\(s\) 7 — ex\. « vingt-six » — ces lignes comptent hors 2026$/.test(d.question)));
});
