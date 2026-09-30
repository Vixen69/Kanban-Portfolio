// The standalone "decided" intent (ADR 026, ADR 052): decisions are taken
// by the gesture, so alone only the pause of a card in Pause is traced
// (decided on paper) or renewed — validated, server-stamped, read back by
// the fold. Review dates lie far ahead so the tests never age.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { BoardConfig, CardEvent } from "../core/types.ts";
import { foldEvents } from "../core/state.ts";
import { testCard, testConfig } from "../core/test-helpers.ts";
import { postEvent, SERVER_ACTOR } from "./api.ts";
import { stubStorage } from "./test-helpers.ts";

// testConfig's decisions (D2 free, D4 traced) and grounds, with a Pause stage.
function board(): BoardConfig {
  const base = testConfig();
  return { ...base, columns: [...base.columns, { id: "pause", name: "Pause", gate: null, review: null, gateStart: null, note: "" }] };
}

const config = board();
const inPause = () => stubStorage([testCard({ id: "S001", columnId: "pause" })]);
const PAUSE = { type: "decided", cardId: "S001", decisionId: "D4", grounds: ["n_avance_pas"], reviewDate: "2099-10-01" };

test("a pause traced on a card in Pause is stored server-stamped and folded back", async () => {
  const storage = inPause();
  const result = await postEvent(storage, config, { ...PAUSE, reason: "  N’avance plus depuis juin.  ", decidedOn: "2026-09-14", actor: "pirate" });
  assert.equal(result.status, 201);
  const event = result.body as CardEvent;
  assert.equal(event.type, "decided");
  assert.equal(event.actor, SERVER_ACTOR);
  assert.deepEqual(event.payload, {
    decisionId: "D4", grounds: ["n_avance_pas"], reason: "N’avance plus depuis juin.", reviewDate: "2099-10-01", decidedOn: "2026-09-14",
  });
  const state = foldEvents(await storage.listBaseCards(), await storage.listEvents())[0];
  assert.equal(state?.decisions[0]?.reviewDate, "2099-10-01");
});

test("alone, only the pause of a card in Pause: any other decision, or a card elsewhere, is refused", async () => {
  await assert.rejects(() => postEvent(inPause(), config, { type: "decided", cardId: "S001", decisionId: "D2" }), /Les décisions se prennent au geste/);
  await assert.rejects(() => postEvent(stubStorage(), config, { ...PAUSE, reason: "x" }), /Les décisions se prennent au geste/);
});

test("a pause without any reason is refused (« non tracée = non prise »)", async () => {
  await assert.rejects(
    () => postEvent(inPause(), config, { ...PAUSE, grounds: [], reason: "  " }),
    /Décision D4 : la raison est obligatoire/,
  );
});

test("unknown grid terms, bad or inverted dates and long reasons are refused", async () => {
  const post = (extra: Record<string, unknown>) => postEvent(inPause(), config, { ...PAUSE, ...extra });
  await assert.rejects(() => post({ grounds: ["x"] }), /Terme de la grille inconnu/);
  await assert.rejects(() => post({ grounds: "fin_proche" }), /Termes de la grille invalides/);
  await assert.rejects(() => post({ reviewDate: "01/10/2026" }), /Date de réexamen invalide/);
  await assert.rejects(() => post({ reason: "x".repeat(1001) }), /Raison : texte trop long/);
  await assert.rejects(() => post({ reviewDate: "2026-09-01", decidedOn: "2026-09-14" }), /précède la décision/);
  await assert.rejects(() => post({ decidedOn: "2999-01-01" }), /dans le futur/);
});

test("grid terms are deduplicated and ordered as the config declares them", async () => {
  const result = await postEvent(inPause(), config, { ...PAUSE, grounds: ["n_avance_pas", "fin_proche", "n_avance_pas"] });
  assert.deepEqual((result.body as CardEvent).payload["grounds"], ["fin_proche", "n_avance_pas"]);
});

test("a renewal may be a parking, without a review date", async () => {
  const storage = inPause();
  await postEvent(storage, config, { ...PAUSE, reason: "x" });
  const renewed = await postEvent(storage, config, { ...PAUSE, reviewDate: null, pauseKind: "parking", reason: "Plus tard." });
  assert.equal((renewed.body as CardEvent).payload["pauseKind"], "parking");
});

test("an archived card refuses decisions until unarchived", async () => {
  const storage = inPause();
  await postEvent(storage, config, { type: "archived", cardId: "S001" });
  await assert.rejects(() => postEvent(storage, config, { ...PAUSE, reason: "x" }), /Carte archivée/);
});

test("unlisted and relisted are import-only: the API refuses them as intents", async () => {
  const storage = stubStorage();
  await assert.rejects(() => postEvent(storage, config, { type: "unlisted", cardId: "S001" }), /non autorisé/);
  await assert.rejects(() => postEvent(storage, config, { type: "relisted", cardId: "S001" }), /non autorisé/);
});
