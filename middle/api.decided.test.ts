// The "decided" intent (ADR 026): validation, server-side actor/ts, the
// traced-decision rule, and the fold reading it back.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent } from "../core/types.ts";
import { foldEvents } from "../core/state.ts";
import { testConfig } from "../core/test-helpers.ts";
import { postEvent, SERVER_ACTOR } from "./api.ts";
import { stubStorage } from "./test-helpers.ts";

const config = testConfig(); // D2 free, D4 traced; grounds fin_proche (proteger), n_avance_pas (pause)

test("a traced decision with grid terms, reason and review date is stored server-stamped", async () => {
  const storage = stubStorage();
  const result = await postEvent(storage, config, {
    type: "decided", cardId: "S001", decisionId: "D4", grounds: ["n_avance_pas"],
    reason: "  N’avance plus depuis juin.  ", reviewDate: "2026-10-01", actor: "pirate",
  });
  assert.equal(result.status, 201);
  const event = result.body as CardEvent;
  assert.equal(event.type, "decided");
  assert.equal(event.actor, SERVER_ACTOR);
  assert.deepEqual(event.payload, {
    decisionId: "D4", grounds: ["n_avance_pas"], reason: "N’avance plus depuis juin.", reviewDate: "2026-10-01",
  });
  const state = foldEvents(await storage.listBaseCards(), await storage.listEvents())[0];
  assert.equal(state?.decisions.length, 1);
  assert.equal(state?.decisions[0]?.reviewDate, "2026-10-01");
});

test("a free decision needs no reason; grounds default to none, review date to null", async () => {
  const storage = stubStorage();
  const result = await postEvent(storage, config, { type: "decided", cardId: "S001", decisionId: "D2" });
  assert.deepEqual((result.body as CardEvent).payload, { decisionId: "D2", grounds: [], reason: "", reviewDate: null });
});

test("a traced decision without any reason is refused (« non tracée = non prise »)", async () => {
  const storage = stubStorage();
  await assert.rejects(
    () => postEvent(storage, config, { type: "decided", cardId: "S001", decisionId: "D4", reason: "  " }),
    /Décision D4 : la raison est obligatoire/,
  );
});

test("unknown decisions, unknown grid terms, bad dates and long reasons are refused", async () => {
  const storage = stubStorage();
  const post = (extra: Record<string, unknown>) =>
    postEvent(storage, config, { type: "decided", cardId: "S001", decisionId: "D2", ...extra });
  await assert.rejects(() => post({ decisionId: "D9" }), /Décision inconnue/);
  await assert.rejects(() => post({ grounds: ["x"] }), /Terme de la grille inconnu/);
  await assert.rejects(() => post({ grounds: "fin_proche" }), /Termes de la grille invalides/);
  await assert.rejects(() => post({ reviewDate: "01/10/2026" }), /Date de réexamen invalide/);
  await assert.rejects(() => post({ reason: "x".repeat(1001) }), /Raison trop longue/);
});

test("grid terms are deduplicated and ordered as the config declares them", async () => {
  const storage = stubStorage();
  const result = await postEvent(storage, config, {
    type: "decided", cardId: "S001", decisionId: "D2", grounds: ["n_avance_pas", "fin_proche", "n_avance_pas"],
  });
  assert.deepEqual((result.body as CardEvent).payload["grounds"], ["fin_proche", "n_avance_pas"]);
});

test("an archived card refuses decisions until unarchived", async () => {
  const storage = stubStorage();
  await postEvent(storage, config, { type: "archived", cardId: "S001" });
  await assert.rejects(
    () => postEvent(storage, config, { type: "decided", cardId: "S001", decisionId: "D2" }),
    /Carte archivée/,
  );
});

test("unlisted and relisted are import-only: the API refuses them as intents", async () => {
  const storage = stubStorage();
  await assert.rejects(() => postEvent(storage, config, { type: "unlisted", cardId: "S001" }), /non autorisé/);
  await assert.rejects(() => postEvent(storage, config, { type: "relisted", cardId: "S001" }), /non autorisé/);
});
