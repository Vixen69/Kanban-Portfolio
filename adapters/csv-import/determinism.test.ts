// ADR 058 — the same files give the same board whatever the row order, the
// load day or the server's time zone: milestone dates are read against the
// export's day in Europe/Paris, a duplicated jalons Id takes its most
// advanced stage, SP rows with different Ids under one name are two
// projects (nothing borrowed), and name-derived ids that collide are told
// apart without touching the others.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { parseCsv } from "./csv.ts";
import type { CsvRow } from "./csv.ts";
import { identifyHeader } from "./contract.ts";
import { createReport } from "./report.ts";
import { parseJalons } from "./jalons.ts";
import type { JalonsTable } from "./jalons.ts";
import { parseSp } from "./sp.ts";
import type { SpTable } from "./sp.ts";
import { assembleCards } from "./enrich.ts";
import type { ProjetEntry, ProjetsTable } from "./projets.ts";
import { baseCardId, disambiguateIds } from "./card-identity.ts";
import { parisDay, referenceDay } from "./reference-day.ts";
import { runImportAudit } from "./orchestrate.ts";
import type { InputFile } from "./orchestrate.ts";
import type { ReferenceDay } from "./reference-day.ts";

const CONFIG = JSON.parse(readFileSync(new URL("../../config/board.json", import.meta.url), "utf8")) as BoardConfig;
const JALONS = "Id;Nom du projet;RDO;RDLI;RDR;RDO franchi;RDLI franchi;RDR franchi;RDO (Statut);RDLI (Statut);RDR (Statut)";
const SP = "Sous domaine;Id;Nom;État du processus;Type Gpe;* Budget validé RDLI;Coût prév (ME);Coût réel;ME Achats;Engagé Achats;Réel Achats";

function rows(header: string, lines: string[]): { cells: string[]; rows: CsvRow[] } {
  const parsed = parseCsv([header, ...lines].join("\n"));
  return { cells: parsed.rows[0]?.cells ?? [], rows: parsed.rows.slice(1) };
}

function jalons(lines: string[], now: Date, reference?: ReferenceDay): JalonsTable {
  const { cells, rows: data } = rows(JALONS, lines);
  const match = identifyHeader(cells);
  if (match.status !== "match") throw new Error("jalons header");
  return parseJalons(data, match, CONFIG, createReport(), "ProjetsJalons.csv", now, reference);
}

function sp(lines: string[]): SpTable {
  const { cells, rows: data } = rows(SP, lines);
  const match = identifyHeader(cells);
  if (match.status !== "match") throw new Error("sp header");
  return parseSp(data, match, createReport(), "SP_2026.csv");
}

function entry(id: string, name: string, line: number): ProjetEntry {
  return {
    id, name, title: name, normalizedName: name.toLowerCase(), normalizedTitle: name.toLowerCase(), codename: id === "" ? null : id,
    typeId: "etude", createdAt: null, dateRdr: null, domainId: "infra", subDomainId: null, domainSource: "orga", domainRule: null,
    owner: null, state: "", budgetRdli: null, effortEstimated: null, effortConsumed: null, ref: { file: "Cout.csv", line },
  };
}

function perimeter(entries: ProjetEntry[]): ProjetsTable {
  return { entries } as unknown as ProjetsTable;
}

const COLUMN = (table: JalonsTable, id: string): string | undefined => table.byId.get(id)?.columnId;

test("Europe/Paris calendar day, whatever the host: 22:30 UTC on 14/10 is already the 15th in Paris", () => {
  assert.equal(parisDay(new Date("2026-10-14T22:30:00.000Z")), "2026-10-15");
  assert.equal(parisDay(new Date("2026-10-14T21:30:00.000Z")), "2026-10-14");
  assert.equal(parisDay(new Date("2026-12-31T23:30:00.000Z")), "2027-01-01", "winter: UTC+1");
});

test("milestone dates without statut are read against the export's day: the same file, loaded weeks apart, gives the same columns", () => {
  const lines = ["PE1;Un;15/09/2026;15/10/2026;;;;;;;"];
  const reference: ReferenceDay = { iso: "2026-09-28", source: "date d’export de « Cout.csv »" };
  const early = jalons(lines, new Date("2026-09-01T09:00:00.000Z"), reference);
  const late = jalons(lines, new Date("2026-10-15T09:00:00.000Z"), reference);
  assert.deepEqual([COLUMN(early, "PE1"), COLUMN(late, "PE1")], ["etudes", "etudes"]);
  const utc = jalons(["PE1;Un;15/09/2026;15/10/2026;;;;;;;"], new Date("2026-10-14T22:30:00.000Z"));
  assert.equal(COLUMN(utc, "PE1"), "actifs", "without an export date: the Paris day of the load");
});

test("the reference day is the latest export date the files carry, else the load day in Paris", () => {
  const file = (name: string, header: string, lines: string[]) => ({ name, headerCells: header.split(";"), dataRows: rows(header, lines).rows });
  const sources = [
    file("Ressources_PdC.csv", "Matricule;Date export", ["M1;30/07/2026"]),
    file("Cout.csv", "Projet. Id;Date d'export", ["PE1;10/09/2026 08:15", "PE2;10/09/2026"]),
  ];
  assert.deepEqual(referenceDay(sources, new Date("2026-10-15T09:00:00.000Z")), { iso: "2026-09-10", source: "date d’export de « Cout.csv »" });
  assert.equal(referenceDay([file("Projets.csv", "Id;Nom", ["PE1;Un"])], new Date("2026-10-14T22:30:00.000Z")).iso, "2026-10-15");
});

test("a duplicated jalons Id takes the most advanced stage its rows read, whatever their order — said as douteux", () => {
  const planned = "PE1;Un;;;;;;;Approuvé;Planifié;";
  const approved = "PE1;Un;;;;;;;Approuvé;Approuvé;";
  const now = new Date("2026-09-30T09:00:00.000Z");
  assert.deepEqual([COLUMN(jalons([planned, approved], now), "PE1"), COLUMN(jalons([approved, planned], now), "PE1")], ["actifs", "actifs"]);
  assert.equal(jalons([planned, approved], now).entries.length, 1);
});

test("a jalons name two Ids carry joins nothing by name; a name-found row with another Id is never borrowed", () => {
  const now = new Date("2026-09-30T09:00:00.000Z");
  const table = jalons(["A1;Portail RH;;;;;;;Approuvé;Approuvé;", "A2;Portail RH;;;;;;;Approuvé;;"], now);
  assert.equal(table.byName.has("portail rh"), false);
  const other = jalons(["ZZ9;Portail RH;;;;;;;Approuvé;Approuvé;"], now);
  const deck = assembleCards(perimeter([entry("PE20016", "Portail RH", 2)]), other, null, CONFIG, createReport())!;
  assert.deepEqual([deck.cards[0]?.columnId, deck.cards[0]?.positioned], ["demandes", false]);
});

test("SP rows with different Ids under one name are two projects: each card its own k€, in any row order", () => {
  const a = ";PE20006;Portail RH;;;100;90;10;;5;";
  const b = ";PE20016;Portail RH;;;200;180;20;;7;";
  const cards = [entry("PE20006", "Portail RH", 2), entry("PE20016", "Portail RH", 3)];
  for (const order of [[a, b], [b, a]]) {
    const deck = assembleCards(perimeter(cards), null, sp(order), CONFIG, createReport())!;
    assert.deepEqual(deck.cards.map((c) => c.budgetEstimated), [90, 180]);
  }
  const alone = assembleCards(perimeter([entry("PE20016", "Portail RH", 2)]), null, sp([a]), CONFIG, createReport())!;
  assert.equal(alone.cards[0]?.budgetEstimated, null, "the only « Portail RH » row is PE20006's: nothing borrowed");
});

test("colliding name-derived ids get a hash of the full name, the same in any order; the others are untouched", () => {
  const long = "programme de modernisation des infrastructures reseau";
  const make = (name: string) => ({ ...assembleCards(perimeter([entry("", name, 2)]), null, null, CONFIG, createReport())!.cards[0]! });
  const lot1 = make(`${long} - lot 1`);
  const lot2 = make(`${long} - lot 2`);
  const short = make("etude connectivite");
  const plain = baseCardId(lot1);
  const forward = [lot1, lot2, short].map((c) => ({ ...c }));
  const backward = [lot2, lot1, short].map((c) => ({ ...c }));
  assert.equal(disambiguateIds(forward).length, 1);
  disambiguateIds(backward);
  const ids = forward.map(baseCardId);
  assert.notEqual(ids[0], ids[1]);
  assert.ok(ids[0]!.startsWith(`${plain}-`));
  assert.deepEqual([baseCardId(backward[1]!), baseCardId(backward[0]!)], [ids[0], ids[1]]);
  assert.equal(ids[2], "IMP-etude-connectivite", "a name id that does not collide never changes");
});

test("the whole audit: the same files loaded on 1 September and 15 October give the same columns (the export's date decides)", () => {
  const fixture = (name: string) => readFileSync(new URL(`../../fixtures/import/${name}`, import.meta.url), "utf8");
  const jalonsText = fixture("ProjetsJalons.csv").replace(
    "10/03/2026;;;;;;;;;;;;RDO;RDLI;;OUI;Approuvé;FAUX;Planifié;", "10/03/2026;;;;;;;05/09/2026;;;;;RDO;RDLI;;OUI;Approuvé;FAUX;;");
  assert.ok(jalonsText.includes("05/09/2026"), "fixture row edited");
  const files = (withExportDates: boolean): InputFile[] =>
    ["Couts.csv", "PARAM.csv", "Projets.csv", "ProjetsJalons.csv", "SP_2026.csv"].map((name) => {
      let text = name === "ProjetsJalons.csv" ? jalonsText : fixture(name);
      if (!withExportDates && name === "Couts.csv") text = text.replaceAll(";10/09/2026", ";");
      return { name, bytes: new Uint8Array(Buffer.from(text, "utf8")) };
    });
  const column = (withDates: boolean, now: string) =>
    runImportAudit(files(withDates), CONFIG, new Date(now)).cards?.cards.find((c) => c.codename === "PE10003")?.columnId;
  assert.deepEqual([column(true, "2026-09-01T09:00:00.000Z"), column(true, "2026-10-15T09:00:00.000Z")], ["actifs", "actifs"]);
  assert.deepEqual([column(false, "2026-09-01T09:00:00.000Z"), column(false, "2026-10-15T09:00:00.000Z")], ["etudes", "actifs"],
    "without an export date the load day decides — the report says so");
});
