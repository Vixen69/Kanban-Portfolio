// ADR 057: everything an imported card carries can be entered by hand.
// The creation intent takes the optional facts, screened with the SAME
// validators as an edit; an unknown or refused key is a French 400; the
// sub-domain must belong to the card's own domain; custom values follow
// config.fields; a closed exercise refuses creation.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { BoardConfig, Card } from "../core/types.ts";
import { testCard, testConfig } from "../core/test-helpers.ts";
import { postEvent } from "./api.ts";
import { postCard } from "./cards.ts";
import { stubStorage } from "./test-helpers.ts";

const BODY = { title: "Sujet saisi", domain: "beta", typeId: "t2", criticality: "normal", owner: "" };

// The test config plus three custom fields.
function withFields(): BoardConfig {
  return {
    ...testConfig(),
    fields: [
      { id: "f_num", name: "Score", type: "number", showOnCard: false },
      { id: "f_sel", name: "Phase", type: "select", showOnCard: false, options: [{ label: "Pilote", color: "#000" }] },
      { id: "f_date", name: "Jalon", type: "date", showOnCard: false },
    ],
  };
}

test("postCard writes every typed fact into the base card", async () => {
  const storage = stubStorage();
  const facts = {
    codename: "  PE10001 ", subDomain: "b1", effortEstimated: 85.5, effortConsumed: 20,
    budgetEstimated: 75, budgetConsumed: 22.5, budgetEngaged: 5, budgetRdli: 90,
    dateRdr: "2026-12-15", loadPlan: "1,5 ETP", resources: ["MOE SI"],
    chargeByProfile: [{ profileId: "pA", jh: 36.5, done: 0 }],
  };
  const result = await postCard(storage, withFields(), { ...BODY, ...facts, custom: { f_num: 3 } });
  assert.equal(result.status, 201);
  const card = (result.body as { card: Card }).card;
  assert.equal(card.codename, "PE10001"); // trimmed
  assert.equal(card.subDomain, "b1");
  assert.equal(card.effortEstimated, 85.5);
  assert.equal(card.budgetRdli, 90);
  assert.equal(card.dateRdr, "2026-12-15");
  assert.equal(card.loadPlan, "1,5 ETP");
  assert.deepEqual(card.resources, ["MOE SI"]);
  assert.deepEqual(card.chargeByProfile, [{ profileId: "pA", jh: 36.5, done: 0 }]);
  assert.deepEqual(card.custom, { f_num: 3 });
  // What stays the server's: first column, today, manual, no Sciforma ref.
  assert.equal(card.columnId, "col1");
  assert.equal(card.source, "manual");
  assert.equal(card.sciformaId, null);
  assert.deepEqual(await storage.listBaseCards().then((cards) => cards[1]), card);
});

test("postCard: an empty or absent code stays null (no invented code)", async () => {
  const blank = await postCard(stubStorage(), testConfig(), { ...BODY, codename: "  " });
  assert.equal((blank.body as { card: Card }).card.codename, null);
  const none = await postCard(stubStorage(), testConfig(), BODY);
  assert.equal((none.body as { card: Card }).card.codename, null);
});

test("postCard refuses unknown, refused and invalid facts in French", async () => {
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ columnId: "col2" }, /Champ de création non autorisé : « columnId » \(tout sujet entre par la première colonne\)/],
    [{ createdAt: "2020-01-01" }, /« createdAt »/],
    [{ nature: "simple" }, /la nature suit le canal/],
    [{ id: "S999" }, /« id »/],
    [{ source: "csv" }, /« source »/],
    [{ sciformaId: "PE1" }, /« sciformaId »/],
    [{ dependencies: [] }, /Champ de création non autorisé : « dependencies »/],
    [{ couleur: "rouge" }, /Champ de création non autorisé : « couleur »/],
    [JSON.parse('{"__proto__": {"x": 1}}') as Record<string, unknown>, /Champ de création non autorisé/],
    [{ effortEstimated: -1 }, /Valeur invalide pour le champ « effortEstimated »/],
    [{ budgetRdli: "90" }, /Valeur invalide pour le champ « budgetRdli »/],
    [{ dateRdr: "2026-12-15T00:00:00.000Z" }, /Valeur invalide pour le champ « dateRdr »/],
    [{ dateRdr: "2026-02-30" }, /Valeur invalide pour le champ « dateRdr »/],
    [{ codename: "x".repeat(41) }, /Valeur invalide pour le champ « codename »/],
    [{ subDomain: "ghost" }, /Valeur invalide pour le champ « subDomain »/],
    [{ domain: "alpha", subDomain: "b1" }, /Sous-domaine « b1 » hors du domaine « Alpha »/],
    [{ custom: { ghost: 1 } }, /Champ personnalisé inconnu : « ghost »/],
    [{ custom: { f_sel: "Autre" } }, /Valeur invalide pour le champ « Phase »/],
    [{ custom: { f_num: "" } }, /Valeur invalide pour le champ « Score »/],
    [{ exercise: 2025 }, /Exercice 2025 clos : création refusée/],
  ];
  const storage = stubStorage();
  for (const [extra, message] of cases) {
    await assert.rejects(() => postCard(storage, withFields(), { ...BODY, ...extra }), message);
  }
  assert.equal((await storage.listBaseCards()).length, 1); // nothing was persisted
  assert.equal((await storage.listEvents()).length, 0);
});

test("an edited sub-domain must belong to the card's own domain", async () => {
  const storage = stubStorage([testCard({ id: "S001", domain: "alpha" })]);
  const edit = (patch: Record<string, unknown>) => postEvent(storage, testConfig(), { type: "edited", cardId: "S001", patch });
  await assert.rejects(() => edit({ subDomain: "b1" }), /Sous-domaine « b1 » hors du domaine « Alpha »/);
  assert.equal((await edit({ domain: "beta", subDomain: "b1" })).status, 201); // same patch: the new domain counts
  assert.equal((await edit({ subDomain: "b2" })).status, 201); // the folded domain is now beta
  assert.equal((await edit({ subDomain: null })).status, 201);
});

test("an edited custom map: new values typed per config.fields, untouched ones pass", async () => {
  const legacy = testCard({ id: "S001", custom: { retired: "ancien", f_num: "" } });
  const storage = stubStorage([legacy]);
  const edit = (custom: Record<string, unknown>) => postEvent(storage, withFields(), { type: "edited", cardId: "S001", patch: { custom } });
  // A field removed from the config and a value typed before the check: kept as they are.
  assert.equal((await edit({ retired: "ancien", f_num: "", f_date: "2026-10-01" })).status, 201);
  assert.equal((await edit({ retired: "ancien", f_num: null, f_sel: "Pilote" })).status, 201);
  await assert.rejects(() => edit({ f_num: "12" }), /Valeur invalide pour le champ « Score »/);
  await assert.rejects(() => edit({ f_date: "01/10/2026" }), /Valeur invalide pour le champ « Jalon »/);
  await assert.rejects(() => edit({ nouveau: "x" }), /Champ personnalisé inconnu : « nouveau »/);
});
