// What the admin is told after a restore (ADR 058): the applied config set
// aside when the versioned model changed since the snapshot, the capacity
// removed for the years the snapshot held none; nothing otherwise.

import { test } from "node:test";
import assert from "node:assert/strict";
import { restoreNotice } from "./apiSnapshots.ts";

const SET_ASIDE =
  "Configuration de l’instantané mise de côté : le modèle versionné (board.json) a changé depuis — " +
  "ses limites WIP, libellés et champs restent dans l’historique de configuration, le modèle versionné s’applique.";

test("restoreNotice: the config set aside, the capacity removed, both, or nothing", () => {
  const cases: Array<[Parameters<typeof restoreNotice>[0], string | null]> = [
    [{}, null],
    [{ configSetAside: false, capacityCleared: [] }, null],
    [{ configSetAside: true, capacityCleared: [] }, `Instantané restauré. ${SET_ASIDE}`],
    [{ configSetAside: false, capacityCleared: [2028, 2027] }, "Instantané restauré. Capacité retirée (l’instantané n’en avait pas) : 2027, 2028."],
    [{ configSetAside: true, capacityCleared: [2027] }, `Instantané restauré. ${SET_ASIDE} Capacité retirée (l’instantané n’en avait pas) : 2027.`],
  ];
  for (const [result, expected] of cases) assert.equal(restoreNotice(result), expected, JSON.stringify(result));
});

test("restoreNotice: the server's list is not reordered in place", () => {
  const capacityCleared = [2028, 2027];
  restoreNotice({ capacityCleared });
  assert.deepEqual(capacityCleared, [2028, 2027]);
});
