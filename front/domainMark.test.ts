// ADR 061: the words of the domain signal and the hand assignment — never a
// preselected domain, never an empty domain written.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardPatch } from "../core/types.ts";
import { foldEvents } from "../core/state.ts";
import { lifecycleEvent } from "../core/events.ts";
import { testCard, testConfig } from "../core/test-helpers.ts";
import { changeWords } from "./changeGroups.ts";
import { domainAssignPatch, domainIssueHint, domainIssueText, domainOptions, TO_ASSIGN, withDomainConfirmed } from "./domainMark.ts";

const CONFIG = testConfig();

test("the « ? » says which problem (table)", () => {
  assert.deepEqual([domainIssueText("missing"), domainIssueText("unresolved")], [
    "Domaine à attribuer", "Domaine à vérifier : l’export n’en donne pas",
  ]);
  assert.match(domainIssueHint("unresolved", "Alpha"), /« Alpha » n’a jamais été confirmé à la main/);
  assert.match(domainIssueHint("missing", ""), /attribuez-le à la main/);
});

test("domain selects: « — à attribuer — » only while nothing is chosen", () => {
  assert.deepEqual(domainOptions(CONFIG, "").map((o) => o.value), ["", "alpha", "beta"]);
  assert.equal(domainOptions(CONFIG, "")[0]?.label, TO_ASSIGN);
  assert.deepEqual(domainOptions(CONFIG, "beta").map((o) => o.value), ["alpha", "beta"]);
});

test("the assignment patch: a declared domain, its own sub-domain or none; nothing without a domain (table)", () => {
  const cases: Array<[string, string, ReturnType<typeof domainAssignPatch>]> = [
    ["", "", null],
    ["ghost", "", null],
    ["alpha", "", { domain: "alpha", subDomain: null }],
    ["beta", "b1", { domain: "beta", subDomain: "b1" }],
    ["alpha", "b1", { domain: "alpha", subDomain: null }],
  ];
  for (const [domain, sub, expected] of cases) assert.deepEqual(domainAssignPatch(CONFIG, domain, sub), expected, `${domain}/${sub}`);
});

test("a change of domain from none reads « Sans domaine → … »", () => {
  assert.deepEqual([changeWords(CONFIG, "domain", ""), changeWords(CONFIG, "domain", "alpha"), changeWords(CONFIG, "owner", "")], [
    "Sans domaine", "Alpha", "—",
  ]);
});

test("« Modifier »: a sub-domain changed alone carries its domain, so the flag clears (table)", () => {
  const cases: Array<[string, CardPatch, string, CardPatch]> = [
    ["sub-domain alone", { subDomain: "b1" }, "beta", { subDomain: "b1", domain: "beta" }],
    ["sub-domain cleared alone", { subDomain: null }, "beta", { subDomain: null, domain: "beta" }],
    ["domain already there", { domain: "alpha", subDomain: null }, "alpha", { domain: "alpha", subDomain: null }],
    ["no sub-domain change", { title: "X" }, "beta", { title: "X" }],
    ["no domain in the draft", { subDomain: null }, "", { subDomain: null }],
  ];
  for (const [name, patch, domain, expected] of cases) assert.deepEqual(withDomainConfirmed(patch, domain), expected, name);
});

test("« Modifier »: the fold clears « à vérifier » once a sub-domain is chosen alone", () => {
  const card = testCard({ id: "c1", domain: "beta", subDomain: null, domainUnresolved: true });
  const patch = withDomainConfirmed({ subDomain: "b1" }, "beta");
  const edited = { ...lifecycleEvent("edited", "c1", "anonymous", "2026-09-30T08:00:00.000Z", { patch }), id: "evt-1" };
  const [state] = foldEvents([card], [edited]);
  assert.deepEqual([state?.domain, state?.subDomain, state?.domainUnresolved], ["beta", "b1", undefined]);
});
