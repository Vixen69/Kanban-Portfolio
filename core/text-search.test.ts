// Search text folding (author, 2026-09-29): accents, case, apostrophes and
// spacing never decide a match.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cardMatchesQuery, foldText } from "./text-search.ts";

test("foldText: case, accents, apostrophes, ligatures and spaces folded", () => {
  assert.equal(foldText("  Sécurité   Réseau "), "securite reseau");
  assert.equal(foldText("Études/Cadrage"), "etudes/cadrage");
  assert.equal(foldText("L’Œuvre d‘été"), "l'oeuvre d'ete");
  assert.equal(foldText("ÇA À"), "ca a");
});

test("cardMatchesQuery: typed without accents finds the accented title or code", () => {
  const card = { title: "Refonte sécurité réseau", codename: "PX-Été" };
  assert.equal(cardMatchesQuery(card, "securite"), true);
  assert.equal(cardMatchesQuery(card, "SÉCURITÉ RÉSEAU"), true);
  assert.equal(cardMatchesQuery(card, "px-ete"), true);
  assert.equal(cardMatchesQuery(card, "   "), true, "a blank query matches everything");
  assert.equal(cardMatchesQuery(card, "infra"), false);
  assert.equal(cardMatchesQuery({ title: "Portail d’accès", codename: null }, "d'acces"), true, "typographic apostrophe");
});

test("cardMatchesQuery: one card object, several queries; an edited card is a new object, read anew (ADR 051)", () => {
  const card = { title: "Refonte gestion clés", codename: "PX123" };
  assert.equal(cardMatchesQuery(card, "cles"), true);
  assert.equal(cardMatchesQuery(card, "px1"), true);
  assert.equal(cardMatchesQuery(card, "sap"), false);
  const edited = { ...card, title: "Migration SAP" };
  assert.equal(cardMatchesQuery(edited, "sap"), true);
  assert.equal(cardMatchesQuery(card, "sap"), false);
});

test("cardMatchesQuery: a query never matches across the title and the code", () => {
  assert.equal(cardMatchesQuery({ title: "Portail", codename: "PX9" }, "portail px"), false);
  assert.equal(cardMatchesQuery({ title: "Portail PX", codename: null }, "portail px"), true);
});
