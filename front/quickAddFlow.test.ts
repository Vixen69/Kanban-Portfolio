// The « + Sujet » flow (front/quickAddFlow.ts): a refused creation keeps
// the modal open with its draft; an accepted one closes it and opens
// « Modifier »; a closed exercise is announced before anything is sent.

import { test } from "node:test";
import assert from "node:assert/strict";
import { closedExerciseNotice, runCreation } from "./quickAddFlow.ts";

function recorder(result: string | null) {
  const calls: string[] = [];
  const steps = {
    create: async (input: string) => { calls.push(`create:${input}`); return result; },
    close: () => { calls.push("close"); },
    openEdit: (id: string) => { calls.push(`edit:${id}`); },
  };
  return { calls, steps };
}

test("runCreation: an accepted card closes the modal, then opens its « Modifier »", async () => {
  const { calls, steps } = recorder("man-12");
  assert.equal(await runCreation(steps, "draft"), true);
  assert.deepEqual(calls, ["create:draft", "close", "edit:man-12"]);
});

test("runCreation: a refused card closes nothing and opens nothing (the draft stays)", async () => {
  const { calls, steps } = recorder(null);
  assert.equal(await runCreation(steps, "draft"), false);
  assert.deepEqual(calls, ["create:draft"]);
});

test("closedExerciseNotice: only a year below the current one is closed", () => {
  const cases: Array<[number, number, string | null]> = [
    [2025, 2026, "Exercice 2025 clos : création refusée."],
    [2026, 2026, null],
    [2027, 2026, null],
  ];
  for (const [viewYear, currentYear, expected] of cases) {
    assert.equal(closedExerciseNotice(viewYear, currentYear), expected, `${viewYear} vs ${currentYear}`);
  }
});
