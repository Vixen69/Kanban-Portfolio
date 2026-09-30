// ADR 062 — the identity doubts the load plan raises: two hand-made cards
// on one code (none adopted, or the one chosen), an adoption whose titles
// differ (adopted, or kept apart), two export projects on one identity
// (the first by code then title — no longer the deck's order — or the
// one chosen). The proposal is ADR 058/059's outcome.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Card, CardEvent } from "../../core/types.ts";
import { lifecycleEvent } from "../../core/events.ts";
import { testCard } from "../../core/test-helpers.ts";
import { planLoad } from "./to-cards.ts";
import type { LoadPlan } from "./to-cards.ts";
import type { EnrichedCard } from "./enrich.ts";
import { createDoubtBook } from "./doubt-book.ts";
import type { DoubtBook } from "./doubt-book.ts";
import { SAMPLE_CONFIG } from "./test-samples.ts";

const NOW = new Date("2026-09-30T09:00:00.000Z");

function deckCard(over: Partial<EnrichedCard> = {}): EnrichedCard {
  return {
    title: "Modernisation atelier", normalizedName: "modernisation atelier", codename: "PE10001",
    laneId: "projets", domainId: "infra", subDomainId: null, domainSource: "orga", domainRule: null,
    owner: null, typeId: "etude", columnId: "etudes", createdAt: "2025-01-12", dateRdr: null,
    budgetRdli: null, budgetEstimated: null, budgetConsumed: null, budgetEngaged: null,
    effortEstimated: null, effortConsumed: null, charges: [], pdcKey: null, positioned: true,
    ref: { file: "Couts.csv", line: 2 }, ...over,
  };
}

function manual(id: string, title: string): Card {
  return testCard({ id, title, codename: "PE10001", source: "manual", domain: "infra", laneId: "projets", columnId: "demandes", createdAt: "2026-09-01T08:00:00.000Z" });
}

function created(card: Card, seq: number): CardEvent {
  return { ...lifecycleEvent("created", card.id, "pmo", card.createdAt), toColumn: card.columnId, id: `evt-${seq}` } as CardEvent;
}

interface Case {
  name: string;
  deck: EnrichedCard[];
  board: Card[];
  id: string;
  choose: RegExp;
  read: (plan: LoadPlan) => unknown;
  proposal: unknown;
  chosen: unknown;
}

const planned = (plan: LoadPlan) => [plan.cards.map((c) => `${c.id}:${c.title}`).sort(), [...plan.aliases]];

const CASES: Case[] = [
  {
    name: "two hand-made cards on one code: none adopted (the export's card apart), or the one chosen",
    deck: [deckCard()], board: [manual("S001", "Atelier A"), manual("S002", "Atelier B")],
    id: "identity|2026|PE10001|cartes-main", choose: /Adopter S002/, read: planned,
    proposal: [["PE10001@2026:Modernisation atelier"], []], chosen: [["S002:Modernisation atelier"], [["PE10001@2026", "S002"]]],
  },
  {
    name: "one hand-made card under another title: adopted (ADR 059), or kept apart",
    deck: [deckCard()], board: [manual("S001", "Atelier (saisi à la main)")],
    id: "identity|2026|PE10001|adoption", choose: /Garder à part/, read: planned,
    proposal: [["S001:Modernisation atelier"], [["PE10001@2026", "S001"]]], chosen: [["PE10001@2026:Modernisation atelier"], []],
  },
  {
    name: "two export projects on one identity: the first by code then title (not the rows' order), or the other",
    deck: [deckCard({ title: "B projet", normalizedName: "b projet" }), deckCard({ title: "A projet", normalizedName: "a projet" })], board: [],
    id: "identity|2026|PE10001|collision", choose: /B projet/, read: planned,
    proposal: [["PE10001@2026:A projet"], []], chosen: [["PE10001@2026:B projet"], []],
  },
];

function run(c: Case, book: DoubtBook): LoadPlan {
  return planLoad(c.deck, SAMPLE_CONFIG, c.board, c.board.map(created), NOW, 2026, new Map(), book);
}

for (const c of CASES) {
  test(`ADR 062 · ${c.name}`, () => {
    const proposedBook = createDoubtBook({ year: 2026 });
    const plan = run(c, proposedBook);
    const doubt = proposedBook.list().find((d) => d.id === c.id);
    assert.ok(doubt !== undefined, `doubt ${c.id} — got ${proposedBook.list().map((d) => d.id).join(", ")}`);
    assert.deepEqual([doubt.how, doubt.kind, doubt.cardId], ["proposé", "identity", "PE10001@2026"]);
    assert.deepEqual(c.read(plan), c.proposal, "the proposal");
    assert.deepEqual(c.read(planLoad(c.deck, SAMPLE_CONFIG, c.board, c.board.map(created), NOW)), c.proposal, "without a book: the same outcome");
    const option = doubt.options.find((o) => c.choose.test(o.label));
    assert.ok(option !== undefined && option.id !== doubt.proposed, doubt.options.map((o) => o.label).join(" | "));
    const chosenBook = createDoubtBook({ year: 2026, choices: new Map([[c.id, option.id]]) });
    assert.deepEqual(c.read(run(c, chosenBook)), c.chosen, "the choice");
    assert.equal(chosenBook.list().find((d) => d.id === c.id)?.how, "choisi");
  });
}

test("ADR 062 · the same title adopts without asking; the collision is said once in the report", () => {
  const book = createDoubtBook({ year: 2026 });
  const plan = planLoad([deckCard()], SAMPLE_CONFIG, [manual("S001", "Modernisation atelier")], [created(manual("S001", "x"), 1)], NOW, 2026, new Map(), book);
  assert.deepEqual([book.list(), plan.adopted.map((a) => a.id)], [[], ["S001"]]);
  const twice = planLoad([deckCard({ title: "B" }), deckCard({ title: "A" })], SAMPLE_CONFIG, [], [], NOW);
  assert.deepEqual(twice.identityDoubts, ["identité « PE10001@2026 » portée par 2 projets de l’export (« A », « B ») — seul « A » est chargé"]);
});
