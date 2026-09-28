// The French wording of the reste à faire read-outs (ADR 048).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateBoardConfig } from "../core/config.ts";
import { testConfig } from "../core/test-helpers.ts";
import { blindNote, classLegend, scopeLabel, scopeTitle } from "./rafLabels.ts";

test("classLegend: the versioned model's words", () => {
  const config = validateBoardConfig(JSON.parse(readFileSync(new URL("../config/board.json", import.meta.url), "utf8")));
  const legend = classLegend(config).map((line) => line.text);
  assert.equal(legend[0], "engagé : Qualification · Études/Cadrage · Actifs");
  assert.equal(legend[1], "non engagé : Demandes · Prêts · Pause");
  assert.equal(legend.length, 3);
});

test("scopeLabel / scopeTitle: every métier, none, a few, many", () => {
  const config = { ...testConfig(), profiles: ["A", "B", "C", "D"].map((id) => ({ id, name: `Métier ${id}`, color: "#000" })) };
  assert.equal(scopeLabel(null, config), "tous métiers");
  assert.equal(scopeLabel(new Set(), config), "aucun métier");
  assert.equal(scopeLabel(new Set(["B", "ghost"]), config), "Métier B");
  assert.equal(scopeLabel(new Set(["D", "A"]), config), "Métier A + Métier D", "config order");
  assert.equal(scopeLabel(new Set(["A", "B", "C"]), config), "Métier A + Métier B + Métier C", "a supplier domain reads in full");
  assert.equal(scopeLabel(new Set(["A", "B", "C", "D"]), config), "Métier A + Métier B + 2 autres");
  assert.equal(scopeTitle(new Set(["C", "A"]), config), "RAF compté sur : Métier A, Métier C");
  assert.equal(scopeTitle(new Set(), config), "Aucun métier compté");
});

test("blindNote: the engaged cards first, the others in a word", () => {
  const split = { engaged: 0, idle: 0, excluded: 0 };
  assert.equal(blindNote({ ...split, blindEngaged: 0, blindOther: 0 }), null);
  assert.equal(blindNote({ ...split, blindEngaged: 1, blindOther: 0 }), "1 sujet engagé sans ventilation par métier (non compté)");
  assert.equal(blindNote({ ...split, blindEngaged: 3, blindOther: 5 }), "3 sujets engagés sans ventilation par métier (non comptés) · 5 ailleurs");
  assert.equal(blindNote({ ...split, blindEngaged: 0, blindOther: 2 }), "0 sujet engagé sans ventilation par métier (non compté) · 2 ailleurs");
});
