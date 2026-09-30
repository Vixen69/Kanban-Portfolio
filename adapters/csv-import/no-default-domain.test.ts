// ADR 061 (author, 2026-09-30: « ça ne devrait pas aller à A&D par
// défaut… il faut que ce soit manuellement assignable, et tu me le
// signales »): a new project whose export resolves no domain enters WITHOUT
// domain; a stored card whose export gives none and whose domain no human
// ever set is flagged « domaine à vérifier » at each load — a hand domain
// (edit, ADR 036 decision, hand creation) clears it; a card without domain
// takes the export's domain as soon as it resolves one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig, Card, CardEvent } from "../../core/types.ts";
import { foldEvents } from "../../core/state.ts";
import { lifecycleEvent } from "../../core/events.ts";
import { runImportAudit } from "./orchestrate.ts";
import type { InputFile } from "./orchestrate.ts";
import { IMPORT_ACTOR, planLoad } from "./to-cards.ts";
import { DOMAIN_MISSING, importChanges } from "./import-changes.ts";
import type { EnrichedCard } from "./enrich.ts";

const CONFIG = JSON.parse(readFileSync(new URL("../../config/board.json", import.meta.url), "utf8")) as BoardConfig;
const NOW = new Date("2026-09-08T09:00:00.000Z");
const PROJETS = readFileSync(new URL("../../fixtures/import/Projets.csv", import.meta.url), "utf8");

function deckCard(over: Partial<EnrichedCard> = {}): EnrichedCard {
  return {
    title: "Modernisation atelier", normalizedName: "modernisation atelier", codename: "PE10001",
    laneId: "projets", domainId: "infra", subDomainId: null, domainSource: "orga", domainRule: "colonne « Domaine (Orga) »",
    owner: "Alice MERLE", typeId: "etude", columnId: "actifs", createdAt: "2025-01-12", dateRdr: null,
    budgetRdli: null, budgetEstimated: null, budgetConsumed: null, budgetEngaged: null,
    effortEstimated: null, effortConsumed: null, charges: [], pdcKey: "modernisation atelier",
    positioned: true, ref: { file: "Projets.csv", line: 2 },
    ...over,
  };
}

const BLANK = { domainId: null, subDomainId: null, domainSource: null, domainRule: null } as const;

interface Board { cards: Card[]; events: CardEvent[] }

// Writes a plan into the board as the store would (upsert, ids in order).
function apply(board: Board, plan: ReturnType<typeof planLoad>): void {
  const byId = new Map(board.cards.map((card) => [card.id, card]));
  for (const card of plan.cards) byId.set(card.id, card);
  board.cards = [...byId.values()];
  board.events = [...board.events, ...plan.events.map((event, i) => ({ ...event, id: `evt-${board.events.length + i + 1}` }))];
}

// A board holding one card the OLD rule put in « ad » by default (no domain decision anywhere).
function legacyBoard(): Board {
  const board: Board = { cards: [], events: [] };
  apply(board, planLoad([deckCard()], CONFIG, [], [], NOW));
  board.cards = board.cards.map((card) => ({ ...card, domain: "ad" }));
  return board;
}

function editedDomain(board: Board, actor: string, domain: string): CardEvent {
  const input = lifecycleEvent("edited", "PE10001@2026", actor, NOW.toISOString(), { patch: { domain, subDomain: null } });
  return { ...input, id: `evt-${board.events.length + 1}` };
}

test("a new project whose export resolves no domain enters WITHOUT domain — never the first configured one", () => {
  const plan = planLoad([deckCard(BLANK)], CONFIG, [], [], NOW);
  assert.deepEqual([plan.cards[0]?.domain, plan.cards[0]?.domainUnresolved, plan.domainMissing], ["", undefined, ["PE10001@2026"]]);
});

test("a stored card whose export gives no domain and no human set it is flagged « à vérifier », at each load", () => {
  const board = legacyBoard();
  const plan = planLoad([deckCard(BLANK)], CONFIG, board.cards, board.events, NOW);
  assert.deepEqual([plan.cards[0]?.domain, plan.cards[0]?.domainUnresolved, plan.domainToCheck], ["ad", true, ["PE10001@2026"]]);
  apply(board, plan);
  const again = planLoad([deckCard(BLANK)], CONFIG, board.cards, board.events, NOW);
  assert.equal(again.cards[0]?.domainUnresolved, true, "recomputed, still flagged");
  const resolved = planLoad([deckCard({ domainId: "ad" })], CONFIG, board.cards, board.events, NOW);
  assert.deepEqual([resolved.cards[0]?.domainUnresolved, "domainUnresolved" in (resolved.cards[0] ?? {})], [undefined, false], "the export gives it again: cleared");
});

test("a human domain — fiche edit, ADR 036 decision or hand creation — is never flagged; the edit clears the flag in the fold", () => {
  const cases: Array<[string, (board: Board) => CardEvent]> = [
    ["edit in the fiche", (board) => editedDomain(board, "anonymous", "ad")],
    ["« garder » at an import", (board) => ({ ...editedDomain(board, IMPORT_ACTOR, "ad"), payload: { patch: { domain: "ad", subDomain: null }, decision: "garder" } })],
    ["hand creation", (board) => ({ ...lifecycleEvent("created", "PE10001@2026", "anonymous", NOW.toISOString()), id: `evt-${board.events.length + 1}` })],
  ];
  for (const [name, human] of cases) {
    const board = legacyBoard();
    apply(board, planLoad([deckCard(BLANK)], CONFIG, board.cards, board.events, NOW)); // flagged
    const event = human(board);
    board.events.push(event);
    if (event.type === "edited") assert.equal(foldEvents(board.cards, board.events)[0]?.domainUnresolved, undefined, `${name}: the fold clears it`);
    const plan = planLoad([deckCard(BLANK)], CONFIG, board.cards, board.events, NOW);
    assert.deepEqual([plan.cards[0]?.domainUnresolved, plan.domainToCheck], [undefined, []], name);
  }
});

test("a card without domain takes the export's domain when it resolves one — no conflict to arbitrate", () => {
  const board: Board = { cards: [], events: [] };
  apply(board, planLoad([deckCard(BLANK)], CONFIG, [], [], NOW));
  const plan = planLoad([deckCard({ domainId: "erp" })], CONFIG, board.cards, board.events, NOW);
  assert.deepEqual([plan.cards[0]?.domain, plan.domainConflicts.length, plan.domainUndecided], ["erp", 0, 0]);
  assert.deepEqual(plan.events.filter((e) => e.type === "edited"), [], "nothing decided: the base card carries it");
});

test("a stored domain the config no longer declares reads as none: filled by the export, never a conflict nor « à vérifier »", () => {
  const ghostBoard = (): Board => {
    const board = legacyBoard();
    board.cards = board.cards.map((card) => ({ ...card, domain: "ghost" }));
    return board;
  };
  const filled = planLoad([deckCard()], CONFIG, ghostBoard().cards, ghostBoard().events, NOW);
  assert.deepEqual([filled.cards[0]?.domain, filled.domainConflicts.length, filled.domainUndecided], ["infra", 0, 0]);
  const blank = planLoad([deckCard(BLANK)], CONFIG, ghostBoard().cards, ghostBoard().events, NOW);
  assert.deepEqual([blank.cards[0]?.domainUnresolved, blank.domainToCheck], [undefined, []], "shown « Sans domaine », not « à vérifier »");
  const kept = ghostBoard(); // a « garder » an earlier version let the PMO take over the ghost
  kept.events.push({ ...editedDomain(kept, IMPORT_ACTOR, "ghost"), payload: { patch: { domain: "ghost", subDomain: null }, decision: "garder", proposed: { domain: "infra", subDomain: null } } });
  const healed = planLoad([deckCard()], CONFIG, kept.cards, kept.events, NOW);
  assert.deepEqual([healed.cards[0]?.domain, healed.domainKeptByPrior, healed.domainConflicts.length], ["infra", 0, 0]);
});

// The Projets onglet with PE10002's domain columns blanked.
function withoutDomain(content: string): InputFile[] {
  const lines = content.split(/\r?\n/).map((line) => {
    if (!line.startsWith("PE10002;")) return line;
    const cells = line.split(";");
    for (const at of [2, 3, 4, 5, 15]) cells[at] = "";
    return cells.join(";");
  });
  return [{ name: "Projets.csv", bytes: new TextEncoder().encode(lines.join("\n")) }];
}

test("the readable report: « à attribuer à la main » for a new card, « Domaine à vérifier » for a stored one", () => {
  const board: Board = { cards: [], events: [] };
  const audit = runImportAudit(withoutDomain(PROJETS), CONFIG, NOW);
  const plan = planLoad(audit.cards?.cards ?? [], CONFIG, [], [], NOW);
  const first = importChanges({ audit, config: CONFIG, year: 2026, plan, baseCards: [], events: [] });
  assert.deepEqual(first.entered.filter((e) => e.domainWarning !== null).map((e) => [e.code, e.domainWarning]), [["PE10002", DOMAIN_MISSING]]);
  apply(board, plan);
  board.cards = board.cards.map((card) => (card.codename === "PE10002" ? { ...card, domain: "ad" } : card)); // the old default
  const next = planLoad(audit.cards?.cards ?? [], CONFIG, board.cards, board.events, NOW);
  const report = importChanges({ audit, config: CONFIG, year: 2026, plan: next, baseCards: board.cards, events: board.events });
  const adName = CONFIG.domains.find((d) => d.id === "ad")?.name ?? "";
  assert.deepEqual(report.domainToCheck?.map((c) => [c.code, c.reason]), [
    ["PE10002", `« ${adName} » : l’export ne donne pas de domaine, jamais confirmé à la main`],
  ]);
});
