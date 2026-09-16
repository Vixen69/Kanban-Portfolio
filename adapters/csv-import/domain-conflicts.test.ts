// ADR 036: what the log says about a card's domain, when a stored card and
// the export disagree, and the event each decision leaves.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig, CardEvent, CardState } from "../../core/types.ts";
import { testCard } from "../../core/test-helpers.ts";
import { IMPORT_ACTOR, domainConflict, domainDecisionEvent, priorDomainDecisions } from "./domain-conflicts.ts";
import type { EnrichedCard } from "./enrich.ts";

const CONFIG = JSON.parse(
  readFileSync(new URL("../../config/board.json", import.meta.url), "utf8"),
) as BoardConfig;

function state(overrides: Parameters<typeof testCard>[0] = {}): CardState {
  return {
    ...testCard({ id: "PE1@2026", title: "Portail", codename: "PE1", domain: "ad", subDomain: "forge_logiciels", ...overrides }),
    enteredColumnAt: "2026-01-01T00:00:00.000Z", comments: [], archived: false, decisions: [], absentFromLastImport: null,
  };
}

function deckCard(domainId: string | null, subDomainId: string | null = null): EnrichedCard {
  return {
    title: "Portail", normalizedName: "portail", codename: "PE1", laneId: "projets",
    domainId, subDomainId, domainSource: domainId === null ? null : "param", domainRule: domainId === null ? null : "dernier segment · « X »",
    owner: null, typeId: null, columnId: "demandes", positioned: false, createdAt: null, dateRdr: null,
    budgetRdli: null, budgetEstimated: null, budgetConsumed: null, budgetEngaged: null,
    effortEstimated: null, effortConsumed: null, charges: [], pdcKey: null, ref: { file: "Couts.csv", line: 2 },
  };
}

function edited(ts: string, actor: string, payload: Record<string, unknown>, id = "evt-1"): CardEvent {
  return { id, ts, actor, cardId: "PE1@2026", type: "edited", fromColumn: null, toColumn: null, payload };
}

test("priorDomainDecisions: the last domain edit in log order wins — a human's is « main », the import's carries its decision", () => {
  const events = [
    edited("2026-09-10T00:00:00.000Z", "pmo", { patch: { domain: "erp" } }, "evt-1"),
    edited("2026-09-03T00:00:00.000Z", IMPORT_ACTOR, { patch: { domain: "ad" }, decision: "garder", proposed: { domain: "vendus", subDomain: null } }, "evt-2"),
    edited("2026-09-12T00:00:00.000Z", "pmo", { patch: { title: "x" } }, "evt-3"), // no domain: ignored
  ];
  const prior = priorDomainDecisions(events).get("PE1@2026");
  assert.deepEqual(prior, { kind: "garder", ts: "2026-09-03T00:00:00.000Z", proposed: { domain: "vendus", subDomain: null } });
  assert.equal(priorDomainDecisions([events[0]!]).get("PE1@2026")?.kind, "main");
  assert.equal(priorDomainDecisions([]).size, 0);
});

test("domainConflict: agreement, a blank export, a ghost sub-domain and a repeated proposal are not conflicts", () => {
  assert.equal(domainConflict(state(), deckCard("ad", "forge_logiciels"), CONFIG, undefined).kind, "none");
  assert.equal(domainConflict(state(), deckCard(null), CONFIG, undefined).kind, "none");
  const ghost = state({ subDomain: "sous-domaine-disparu" });
  assert.equal(domainConflict(ghost, deckCard("ad"), CONFIG, undefined).kind, "none", "a sub-domain the config no longer declares counts as none");
  const prior = { kind: "garder" as const, ts: "2026-09-03T00:00:00.000Z", proposed: { domain: "vendus", subDomain: null } };
  assert.equal(domainConflict(state(), deckCard("vendus"), CONFIG, prior).kind, "kept-by-prior");
  const check = domainConflict(state(), deckCard("erp"), CONFIG, prior);
  assert.equal(check.kind, "conflict");
  if (check.kind !== "conflict") return;
  assert.deepEqual(check.conflict, {
    cardId: "PE1@2026", title: "Portail", codename: "PE1",
    board: { domain: "ad", subDomain: "forge_logiciels" }, proposed: { domain: "erp", subDomain: null },
    rule: "dernier segment · « X »", prior: { kind: "garder", ts: "2026-09-03T00:00:00.000Z" },
  });
});

test("domainDecisionEvent: « remplacer » patches to the proposal, « garder » patches to the board and remembers the proposal", () => {
  const check = domainConflict(state(), deckCard("erp"), CONFIG, undefined);
  if (check.kind !== "conflict") throw new Error("expected a conflict");
  const replace = domainDecisionEvent(check.conflict, "remplacer", "2026-09-16T10:00:00.000Z");
  assert.deepEqual([replace.type, replace.actor, replace.cardId, replace.payload["patch"], replace.payload["decision"]],
    ["edited", IMPORT_ACTOR, "PE1@2026", { domain: "erp", subDomain: null }, "remplacer"]);
  const keep = domainDecisionEvent(check.conflict, "garder", "2026-09-16T10:00:00.000Z");
  assert.deepEqual([keep.payload["patch"], keep.payload["proposed"]],
    [{ domain: "ad", subDomain: "forge_logiciels" }, { domain: "erp", subDomain: null }]);
});
