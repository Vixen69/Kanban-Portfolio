// The ProjetsCdP join (owners.ts) under the ADR 058 §2 guard: the Id
// first; the name only when the namesake rows carry no OTHER Id than the
// card's — a namesake of another Id is another project: refused, said as
// douteux, no chef de projet borrowed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "./csv.ts";
import { CDP_CONTRACT, identifyHeader } from "./contract.ts";
import { createReport } from "./report.ts";
import type { ImportReport } from "./report.ts";
import { parseCdp } from "./cdp.ts";
import type { CdpTable } from "./cdp.ts";
import { CDP_OTHER_ID, attachOwners } from "./owners.ts";
import type { CardAssembly, CardStats, EnrichedCard } from "./enrich.ts";

const HEADER = "Id;Nom;Responsable 1;Responsable 2;Responsable 3";

function table(lines: readonly string[], report: ImportReport): CdpTable {
  const parsed = parseCsv([HEADER, ...lines].join("\n"));
  const identified = identifyHeader(parsed.rows[0]?.cells ?? []);
  if (identified.status !== "match" || identified.contract.id !== CDP_CONTRACT.id) throw new Error("cdp header");
  return parseCdp(parsed.rows.slice(1), identified, null, report, "ProjetsCdP.csv");
}

function card(codename: string | null, name: string): EnrichedCard {
  return {
    title: name, normalizedName: name.toLowerCase(), codename, laneId: "projets", domainId: "infra", subDomainId: null,
    domainSource: "orga", domainRule: null, owner: null, typeId: null, columnId: "demandes", positioned: false,
    createdAt: null, dateRdr: null, budgetRdli: null, budgetEstimated: null, budgetConsumed: null, budgetEngaged: null,
    effortEstimated: null, effortConsumed: null, charges: [], pdcKey: null, ref: { file: "Projets.csv", line: 7 },
  };
}

function deckOf(cards: EnrichedCard[]): CardAssembly {
  return { cards, stats: { withOwner: 0 } as CardStats };
}

const CASES: Array<{ name: string; card: EnrichedCard; rows: string[]; owner: string | null; doubt: boolean }> = [
  { name: "joined by its Id", card: card("PE1", "Portail"), rows: ["PE1;Autre nom;Alice MERLE;;"], owner: "Alice MERLE", doubt: false },
  { name: "the name, the row carrying no Id", card: card("PE1", "Portail"), rows: [";Portail;Bruno DIAZ;;"], owner: "Bruno DIAZ", doubt: false },
  { name: "the name, a row of ANOTHER Id: refused", card: card("PE1", "Portail"), rows: ["PE9;Portail;Bruno DIAZ;;"], owner: null, doubt: true },
  { name: "a card without Id, one namesake Id: joined", card: card(null, "Portail"), rows: ["PE9;Portail;Bruno DIAZ;;"], owner: "Bruno DIAZ", doubt: false },
  { name: "a card without Id, two Ids under the name: two projects, refused", card: card(null, "Portail"),
    rows: ["PE8;Portail;Alice MERLE;;", "PE9;Portail;Bruno DIAZ;;"], owner: null, doubt: true },
  { name: "no row at all", card: card("PE1", "Portail"), rows: ["PE9;Autre;Bruno DIAZ;;"], owner: null, doubt: false },
];

for (const c of CASES) {
  test(`ProjetsCdP join: ${c.name}`, () => {
    const report = createReport();
    const deck = deckOf([{ ...c.card }]);
    const stats = attachOwners(deck, table(c.rows, report), report);
    assert.equal(deck.cards[0]?.owner, c.owner);
    assert.equal(stats?.filled, c.owner === null ? 0 : 1);
    const doubts = report.doubtful.filter((d) => d.question.startsWith(CDP_OTHER_ID));
    assert.equal(doubts.length, c.doubt ? 1 : 0);
  });
}

test("ProjetsCdP join: a card that already has its chef de projet borrows nothing and raises no doubt", () => {
  const report = createReport();
  const deck = deckOf([{ ...card("PE1", "Portail"), owner: "Chloé ROY" }]);
  attachOwners(deck, table(["PE9;Portail;Bruno DIAZ;;"], report), report);
  assert.deepEqual([deck.cards[0]?.owner, report.doubtful.length], ["Chloé ROY", 0]);
});
