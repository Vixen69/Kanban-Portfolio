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
