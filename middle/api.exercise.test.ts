// ADR 035: a created card is stamped with the current exercise unless the
// intent names another year (a board in preparation).

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Card } from "../core/types.ts";
import { testConfig } from "../core/test-helpers.ts";
import { postCard } from "./cards.ts";
import { stubStorage } from "./test-helpers.ts";

const config = testConfig();
const BODY = { title: "Nouveau sujet", domain: "beta", laneId: "laneB", typeId: "t2", criticality: "top", owner: "Mme Chef" };

test("postCard stamps the current exercise by default, or the requested year", async () => {
  const storage = stubStorage();
  const byDefault = await postCard(storage, config, BODY);
  assert.equal(byDefault.status, 201);
  assert.equal((byDefault.body as { card: Card }).card.exercise, config.exercise.year);
  const requested = await postCard(storage, config, { ...BODY, exercise: config.exercise.year + 1 });
  assert.equal((requested.body as { card: Card }).card.exercise, config.exercise.year + 1);
});
