// ADR 061: the words of the domain signal and the hand assignment — never a
// preselected domain, never an empty domain written.

import { test } from "node:test";
import assert from "node:assert/strict";
import { testConfig } from "../core/test-helpers.ts";
import { changeWords } from "./changeGroups.ts";
import { domainAssignPatch, domainIssueHint, domainIssueText, domainOptions, TO_ASSIGN } from "./domainMark.ts";

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
