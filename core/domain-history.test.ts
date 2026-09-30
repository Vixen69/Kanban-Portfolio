// The domain lines of the fiche's Historique (author, 2026-09-30): every
// domain set on a card — by hand, or by an ADR 036 import decision — reads
// as one line, « from » the domain the card had just before.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent } from "./types.ts";
import { domainLabel, domainLines, domainPrevious } from "./domain-history.ts";
import { cardHistory } from "./history.ts";
import { testConfig } from "./test-helpers.ts";

const CONFIG = testConfig(); // alpha « Alpha »; beta « Beta » with b1 « Beta 1 », b2 « Beta 2 »
const NONE = { domain: "", subDomain: null };

let seq = 0;
function edited(payload: Record<string, unknown>, actor = "pmo"): CardEvent {
  seq += 1;
  const ts = `2026-09-${String(10 + seq).padStart(2, "0")}T09:00:00.000Z`;
  return { id: `evt-${seq}`, ts, actor, cardId: "S001", type: "edited", fromColumn: null, toColumn: null, payload };
}

function decision(kind: "garder" | "remplacer", board: string, proposed: string): CardEvent {
  const value = kind === "remplacer" ? proposed : board;
  return edited({
    patch: { domain: value, subDomain: null }, decision: kind,
    board: { domain: board, subDomain: null }, proposed: { domain: proposed, subDomain: null },
  }, "import-csv");
}

// Each case: the card's events, oldest first → the lines, oldest first (null = no line).
const CASES: Array<{ name: string; events: () => CardEvent[]; lines: Array<{ text: string; note: string | null } | null> }> = [
  {
    name: "a hand assignment on a card without domain (ADR 061 banner)",
    events: () => [edited({ patch: { domain: "beta", subDomain: "b1" }, previous: NONE })],
    lines: [{ text: "Domaine : Sans domaine → Beta · Beta 1", note: null }],
  },
  {
    name: "a hand change",
    events: () => [edited({ patch: { domain: "beta" }, previous: { domain: "alpha", subDomain: null } })],
    lines: [{ text: "Domaine : Alpha → Beta", note: null }],
  },
  {
    name: "a confirmation of the same domain (« Confirmer ce domaine »)",
    events: () => [edited({ patch: { domain: "alpha", subDomain: null }, previous: { domain: "alpha", subDomain: null } })],
    lines: [{ text: "Domaine confirmé : Alpha", note: null }],
  },
  {
    name: "a sub-domain change in the same line",
    events: () => [edited({ patch: { domain: "beta", subDomain: "b2" }, previous: { domain: "beta", subDomain: "b1" } })],
    lines: [{ text: "Domaine : Beta · Beta 1 → Beta · Beta 2", note: null }],
  },
  {
    name: "a domain the config no longer declares reads « Sans domaine »",
    events: () => [edited({ patch: { domain: "alpha" }, previous: { domain: "ghost", subDomain: null } })],
    lines: [{ text: "Domaine : Sans domaine → Alpha", note: null }],
  },
  {
    name: "a change between two removed domains is no confirmation: the ids are named",
    events: () => [edited({ patch: { domain: "ghost2" }, previous: { domain: "ghost1", subDomain: null } })],
    lines: [{ text: "Domaine : Sans domaine (« ghost1 », retiré du modèle) → Sans domaine (« ghost2 », retiré du modèle)", note: null }],
  },
  {
    name: "an assignment of a domain later removed is no confirmation",
    events: () => [edited({ patch: { domain: "ghost" }, previous: NONE })],
    lines: [{ text: "Domaine : Sans domaine → Sans domaine (« ghost », retiré du modèle)", note: null }],
  },
  {
    name: "a change between two removed sub-domains is no confirmation",
    events: () => [edited({ patch: { domain: "beta", subDomain: "b9" }, previous: { domain: "beta", subDomain: "b8" } })],
    lines: [{ text: "Domaine : Beta · « b8 » (retiré du modèle) → Beta · « b9 » (retiré du modèle)", note: null }],
  },
  {
    name: "a removed sub-domain to the bare domain is no confirmation",
    events: () => [edited({ patch: { domain: "beta", subDomain: null }, previous: { domain: "beta", subDomain: "b8" } })],
    lines: [{ text: "Domaine : Beta · « b8 » (retiré du modèle) → Beta", note: null }],
  },
  {
    name: "a confirmation of a removed domain is still a confirmation",
    events: () => [edited({ patch: { domain: "ghost" }, previous: { domain: "ghost", subDomain: null } })],
    lines: [{ text: "Domaine confirmé : Sans domaine", note: null }],
  },
  {
    name: "an ADR 036 « remplacer » says the import decided",
    events: () => [decision("remplacer", "alpha", "beta")],
    lines: [{ text: "Domaine remplacé par l’export (décision à l’import) : Alpha → Beta", note: null }],
  },
  {
    name: "an ADR 036 « garder » says what the export proposed",
    events: () => [decision("garder", "alpha", "beta")],
    lines: [{ text: "Domaine gardé (décision à l’import) : Alpha", note: "l’export proposait Beta" }],
  },
  {
    name: "an older log without `previous`: the first line cannot say where from, the next ones walk on",
    events: () => [edited({ patch: { domain: "alpha" } }), edited({ patch: { domain: "beta" } }), edited({ patch: { domain: "beta" } })],
    lines: [{ text: "Domaine fixé : Alpha", note: null }, { text: "Domaine : Alpha → Beta", note: null }, { text: "Domaine confirmé : Beta", note: null }],
  },
  {
    name: "a sub-domain-only patch (older « Modifier ») has no line but moves the walk on",
    events: () => [edited({ patch: { domain: "beta" }, previous: NONE }), edited({ patch: { subDomain: "b2" } }), edited({ patch: { domain: "beta" } })],
    lines: [{ text: "Domaine : Sans domaine → Beta", note: null }, null, { text: "Domaine confirmé : Beta · Beta 2", note: null }],
  },
  {
    name: "edits without an accepted domain are not narrated",
    events: () => [edited({ patch: { title: "Autre titre" } }), edited({ patch: { domain: "" } }), edited({ patch: "nope" })],
    lines: [null, null, null],
  },
  {
    name: "a decision after a hand change reads its own board, not the walk",
    events: () => [edited({ patch: { domain: "beta" }, previous: NONE }), decision("remplacer", "beta", "alpha")],
    lines: [{ text: "Domaine : Sans domaine → Beta", note: null }, { text: "Domaine remplacé par l’export (décision à l’import) : Beta → Alpha", note: null }],
  },
];

for (const c of CASES) {
  test(`domain lines: ${c.name}`, () => {
    const events = c.events();
    const lines = domainLines(events, CONFIG);
    assert.deepEqual(events.map((event) => lines.get(event) ?? null), c.lines);
  });
}

test("domainLabel: names, the sub-domain after « · », « Sans domaine » for empty or unknown", () => {
  const cases: Array<[string, string | null, string]> = [
    ["alpha", null, "Alpha"], ["beta", "b1", "Beta · Beta 1"], ["beta", "zz", "Beta"], ["", null, "Sans domaine"], ["ghost", "b1", "Sans domaine"],
  ];
  for (const [domain, subDomain, label] of cases) assert.equal(domainLabel(CONFIG, { domain, subDomain }), label, `${domain}/${subDomain}`);
});

test("domainPrevious: recorded only when the patch touches the domain or the sub-domain", () => {
  const state = { domain: "", subDomain: null };
  assert.deepEqual(domainPrevious(state, { domain: "alpha" }), { previous: NONE });
  assert.deepEqual(domainPrevious({ domain: "beta", subDomain: "b1" }, { subDomain: "b2" }), { previous: { domain: "beta", subDomain: "b1" } });
  assert.deepEqual(domainPrevious(state, { title: "x" }), {});
});

test("cardHistory: a domain line among the others, with its actor and date, in the fold order", () => {
  const events: CardEvent[] = [
    { id: "evt-3", ts: "2026-09-20T09:00:00.000Z", actor: "pmo", cardId: "S001", type: "edited", fromColumn: null, toColumn: null, payload: { patch: { domain: "beta", subDomain: "b1" }, previous: NONE } },
    { id: "evt-1", ts: "2026-09-01T00:00:00.000Z", actor: "import-csv", cardId: "S001", type: "imported", fromColumn: null, toColumn: "col1", payload: { laneId: "laneA" } },
    { id: "evt-2", ts: "2026-09-15T09:00:00.000Z", actor: "pmo", cardId: "S001", type: "edited", fromColumn: null, toColumn: null, payload: { patch: { title: "Titre" } } },
    { id: "evt-4", ts: "2026-09-25T09:00:00.000Z", actor: "pmo", cardId: "S001", type: "edited", fromColumn: null, toColumn: null, payload: { patch: { domain: "beta", subDomain: "b1" } } },
  ];
  assert.deepEqual(cardHistory(events, "S001", CONFIG), [
    { kind: "domain", fromName: null, toName: null, reason: null, detail: "Domaine confirmé : Beta · Beta 1", gesture: null, ts: "2026-09-25T09:00:00.000Z", actor: "pmo" },
    { kind: "domain", fromName: null, toName: null, reason: null, detail: "Domaine : Sans domaine → Beta · Beta 1", gesture: null, ts: "2026-09-20T09:00:00.000Z", actor: "pmo" },
    { kind: "move", fromName: null, toName: "Colonne 1", reason: null, detail: null, gesture: null, ts: "2026-09-01T00:00:00.000Z", actor: "import-csv" },
  ]);
});
