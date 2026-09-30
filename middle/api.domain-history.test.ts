// A hand edit touching the domain records where the card stood
// (`previous`), so that the fiche's Historique says « Alpha → Beta »
// even after a load has rewritten the base card (author, 2026-09-30).

import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent } from "../core/types.ts";
import { testConfig } from "../core/test-helpers.ts";
import { cardHistory } from "../core/history.ts";
import { postEvent } from "./api.ts";
import { stubStorage } from "./test-helpers.ts";

const config = testConfig();

const CASES: Array<{ name: string; patch: Record<string, unknown>; previous: unknown }> = [
  { name: "a domain change", patch: { domain: "beta", subDomain: "b1" }, previous: { domain: "alpha", subDomain: null } },
  { name: "a confirmation", patch: { domain: "alpha" }, previous: { domain: "alpha", subDomain: null } },
  { name: "no domain in the patch: nothing recorded", patch: { title: "Autre titre" }, previous: undefined },
];

for (const c of CASES) {
  test(`edited intent: ${c.name}`, async () => {
    const result = await postEvent(stubStorage(), config, { type: "edited", cardId: "S001", patch: c.patch });
    const payload = (result.body as CardEvent).payload;
    assert.deepEqual([payload["patch"], payload["previous"]], [c.patch, c.previous]);
  });
}

test("the fiche's Historique reads the recorded domain: two hand changes in a row", async () => {
  const storage = stubStorage();
  await postEvent(storage, config, { type: "edited", cardId: "S001", patch: { domain: "beta", subDomain: "b2" } });
  await postEvent(storage, config, { type: "edited", cardId: "S001", patch: { domain: "alpha", subDomain: null } });
  const lines = cardHistory(await storage.listEvents(), "S001", config).map((entry) => [entry.kind, entry.detail]);
  assert.deepEqual(lines, [["domain", "Domaine : Beta · Beta 2 → Alpha"], ["domain", "Domaine : Alpha → Beta · Beta 2"]]);
});
