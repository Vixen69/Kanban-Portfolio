// ADR 062 — every decidable doubt the audit raises, table-driven on
// synthetic files: the tool's proposal is today's behaviour (no
// regression), and the other choice changes the deck as its option says.
// Identity doubts (raised by the load plan) are in doubt-identity.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { ImportDoubt } from "../../core/import-types.ts";
import { runImportAudit } from "./orchestrate.ts";
import type { AuditResult, InputFile } from "./orchestrate.ts";
import { createDoubtBook } from "./doubt-book.ts";
import { SAMPLE_CONFIG, coutsRow, sampleFiles } from "./test-samples.ts";

const NOW = new Date("2026-09-30T12:00:00.000Z");

interface Case {
  name: string;
  files: InputFile[];
  /** The doubt's id. */
  id: string;
  /** The option chosen instead of the proposal (by its label). */
  choose: RegExp;
  /** What the test reads of the deck. */
  read: (audit: AuditResult) => unknown;
  proposal: unknown;
  chosen: unknown;
}

const card = (audit: AuditResult, code: string) => audit.cards?.cards.find((c) => c.codename === code);
const SOCLE = coutsRow("PE20001", "Socle réseau");
const jalon = (id: string, name: string, rdo: string, rdli: string) =>
  ({ "Id": id, "Nom du projet": name, "RDO (Statut)": rdo, "RDLI (Statut)": rdli, "RDR (Statut)": "Planifié" });
const spRow = (id: string, name: string, estimate: string) => ({ "Id": id, "Nom": name, "Coût prév (ME)": estimate });
const cdpRow = (id: string, name: string, owner: string) => ({ "Id": id, "Nom": name, "Responsable 1": owner });
const projetsRow = (id: string, nom: string) => ({ "Id": id, "Nom": nom, "Type": "Etude (Opportunité)", "Domaine (Orga)": "INFRA", "État du processus": "Nouveau" });

const CASES: Case[] = [
  {
    name: "COUT PREV rows disagree on the état: the most frequent is kept; « Budget présenté » takes the project out",
    files: sampleFiles({ couts: [SOCLE, SOCLE, coutsRow("PE20001", "Socle réseau", { "Projet.Etat du processus": "Budget présenté" })] }),
    id: "couts-fact|2026|PE20001|etat", choose: /Budget présenté/,
    read: (a) => [card(a, "PE20001") !== undefined, a.couts?.verdicts.find((v) => v.code === "PE20001")?.settledBy ?? null],
    proposal: [true, null], chosen: [false, "état « Budget présenté » (tranché à l'import)"],
  },
  {
    name: "COUT PREV rows disagree on the portefeuille: the other one gives another domain",
    files: sampleFiles({ couts: [SOCLE, SOCLE, coutsRow("PE20001", "Socle réseau", { "Projet.Portefeuille": "DSI NEXTER.CORPORATE.ACHATS" })] }),
    id: "couts-fact|2026|PE20001|portfolio", choose: /CORPORATE/,
    read: (a) => card(a, "PE20001")?.domainId, proposal: "infra", chosen: "corporate",
  },
  {
    name: "an unreadable ME cell alone keeps the project; « écarter » sets it aside like a project without ME",
    files: sampleFiles({ couts: [coutsRow("PE20002", "Stockage", { "Coût final ME (Res ouTrans)": "???" })] }),
    id: "me-unreadable|2026|PE20002|me", choose: /écarter/i,
    read: (a) => [card(a, "PE20002") !== undefined, a.couts?.verdicts.find((v) => v.code === "PE20002")?.motive],
    proposal: [true, "retained"], chosen: [false, "noMe"],
  },
  {
    name: "one Id twice in the Projets onglet (the perimeter): the tool's row, or the other one",
    files: sampleFiles({ projets: [projetsRow("PE30001", "Alpha bis"), projetsRow("PE30001", "Alpha")] }),
    id: "duplicate-row|2026|PE30001|projets", choose: /Alpha bis/,
    read: (a) => card(a, "PE30001")?.title, proposal: "Alpha", chosen: "Alpha bis",
  },
  {
    name: "one Id twice in ProjetsJalons: the most advanced stage, or one row alone",
    files: sampleFiles({ couts: [SOCLE], jalons: [jalon("PE20001", "Socle réseau", "Approuvé", "Planifié"), jalon("PE20001", "Socle réseau", "Approuvé", "Approuvé")] }),
    id: "duplicate-row|2026|PE20001|jalons", choose: /ligne \d+ seule/,
    read: (a) => card(a, "PE20001")?.columnId, proposal: "actifs", chosen: "etudes",
  },
  {
    name: "one Id twice in SP: the tool's row, or the other one's figures",
    files: sampleFiles({ couts: [SOCLE], sp: [spRow("PE20001", "Socle réseau", "20"), spRow("PE20001", "Socle réseau", "10")] }),
    id: "duplicate-row|2026|PE20001|sp", choose: /« 20 »/,
    read: (a) => card(a, "PE20001")?.budgetEstimated, proposal: 10, chosen: 20,
  },
  {
    name: "one Id twice in ProjetsCdP naming two chefs de projet: the tool's row, or the other name",
    files: sampleFiles({ couts: [SOCLE], cdp: [cdpRow("PE20001", "Socle réseau", "MARTIN Eva"), cdpRow("PE20001", "Socle réseau", "DURAND Luc")] }),
    id: "duplicate-row|2026|PE20001|cdp", choose: /MARTIN/,
    read: (a) => card(a, "PE20001")?.owner, proposal: "DURAND Luc", chosen: "MARTIN Eva",
  },
  {
    name: "a ProjetsJalons row found by name carries another Id: not attached, or attached",
    files: sampleFiles({ couts: [SOCLE], jalons: [jalon("PE99999", "Socle réseau", "Approuvé", "Planifié")] }),
    id: "join|2026|PE20001|jalons-nom", choose: /Rattacher/,
    read: (a) => [card(a, "PE20001")?.columnId, card(a, "PE20001")?.positioned], proposal: ["demandes", false], chosen: ["etudes", true],
  },
  {
    name: "an SP name carried by two Ids: no cost borrowed, or the chosen row's",
    files: sampleFiles({ couts: [SOCLE], sp: [spRow("PE88881", "Socle réseau", "10"), spRow("PE88882", "Socle réseau", "20")] }),
    id: "join|2026|PE20001|sp-nom-ambigu", choose: /PE88882/,
    read: (a) => card(a, "PE20001")?.budgetEstimated, proposal: null, chosen: 20,
  },
  {
    name: "the SP row at the card's Id and the row at its name differ: the Id row, or the name row",
    files: sampleFiles({ couts: [SOCLE], sp: [spRow("PE20001", "Autre sujet", "10"), spRow("PE77777", "Socle réseau", "30")] }),
    id: "join|2026|PE20001|sp-id-nom", choose: /PE77777/,
    read: (a) => card(a, "PE20001")?.budgetEstimated, proposal: 10, chosen: 30,
  },
  {
    name: "a ProjetsCdP row at the card's name carries another Id: no chef de projet, or that row's",
    files: sampleFiles({ couts: [SOCLE], cdp: [cdpRow("PE66666", "Socle réseau", "BLANC Paul")] }),
    id: "join|2026|PE20001|cdp-nom", choose: /Prendre/,
    read: (a) => card(a, "PE20001")?.owner, proposal: null, chosen: "BLANC Paul",
  },
  {
    name: "an ambiguous k€ figure « 1,035 »: the French reading, or the English one",
    files: sampleFiles({ couts: [SOCLE], sp: [spRow("PE20001", "Socle réseau", "1,035")] }),
    id: "figure|2026|PE20001|Coût prév (ME)", choose: /anglaise/,
    read: (a) => card(a, "PE20001")?.budgetEstimated, proposal: 1.035, chosen: 1035,
  },
];

function doubtOf(audit: AuditResult, id: string): ImportDoubt {
  const doubt = audit.book.list().find((d) => d.id === id);
  assert.ok(doubt !== undefined, `doubt ${id} raised — got ${audit.book.list().map((d) => d.id).join(", ")}`);
  return doubt;
}

for (const c of CASES) {
  test(`ADR 062 · ${c.name}`, () => {
    const proposed = runImportAudit(c.files, SAMPLE_CONFIG, NOW);
    const doubt = doubtOf(proposed, c.id);
    assert.deepEqual([doubt.how, doubt.applied, doubt.options[0]?.id], ["proposé", doubt.proposed, doubt.proposed]);
    assert.ok(doubt.why.length > 0 && doubt.options.length >= 2 && doubt.title !== "");
    assert.deepEqual(c.read(proposed), c.proposal, "the proposal is today's behaviour");
    const option = doubt.options.find((o) => c.choose.test(o.label));
    assert.ok(option !== undefined && option.id !== doubt.proposed, `an option matches ${c.choose} — ${doubt.options.map((o) => o.label).join(" | ")}`);
    const book = createDoubtBook({ year: 2026, choices: new Map([[c.id, option.id]]) });
    const chosen = runImportAudit(c.files, SAMPLE_CONFIG, NOW, 2026, book);
    assert.deepEqual([doubtOf(chosen, c.id).how, doubtOf(chosen, c.id).applied], ["choisi", option.id]);
    assert.deepEqual(c.read(chosen), c.chosen, "the choice changes the deck as its option says");
    assert.deepEqual(c.read(runImportAudit(c.files, SAMPLE_CONFIG, NOW, 2026, createDoubtBook({ year: 2026, choices: new Map([[c.id, option.id]]) }))), c.chosen, "deterministic");
  });
}

test("ADR 062 · side-file doubts of projects outside the deck are not asked", () => {
  const files = sampleFiles({ couts: [SOCLE], sp: [spRow("PE55555", "Hors périmètre", "1"), spRow("PE55555", "Hors périmètre", "2")] });
  assert.deepEqual(runImportAudit(files, SAMPLE_CONFIG, NOW).book.list().map((d) => d.id), []);
});

test("ADR 062 · an SP row without Id read BEFORE its Id's row no longer sets that row aside (order-free grouping)", () => {
  const files = sampleFiles({ couts: [SOCLE], sp: [{ "Nom": "Socle réseau", "Coût prév (ME)": "5" }, spRow("PE20001", "Socle réseau", "7")] });
  const audit = runImportAudit(files, SAMPLE_CONFIG, NOW);
  assert.equal(card(audit, "PE20001")?.budgetEstimated, 7, "the row carrying the Id (more complete) is kept");
});
