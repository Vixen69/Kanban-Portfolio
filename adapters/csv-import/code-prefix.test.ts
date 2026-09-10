// The project code leaves the title wherever it sits — front, inside, or
// bracketed, whatever the separator; a longer token that merely starts with
// the code is left alone, and a name reduced to its code is kept.

import { test } from "node:test";
import assert from "node:assert/strict";
import { stripCode } from "./code-prefix.ts";

const CASES: Array<[string, string | null, string]> = [
  ["PX4520155 - Modernisation atelier", "PX4520155", "Modernisation atelier"],
  ["PX4520155 Modernisation atelier", "PX4520155", "Modernisation atelier"],
  ["PX4520155 : Modernisation atelier", "PX4520155", "Modernisation atelier"],
  ["px4520155_Modernisation atelier", "PX4520155", "Modernisation atelier"],
  ["[PX4520155] Modernisation atelier", "PX4520155", "Modernisation atelier"],
  ["(PX4520155) Modernisation atelier", "PX4520155", "Modernisation atelier"],
  ["  PX4520155 — Modernisation atelier  ", "PX4520155", "Modernisation atelier"],
  ["Modernisation atelier PX4520155", "PX4520155", "Modernisation atelier"],
  ["Modernisation atelier (PX4520155)", "PX4520155", "Modernisation atelier"],
  ["PE10001 - Portail (PE10001)", "PE10001", "Portail"],
  ["PX45201559 Autre projet", "PX4520155", "PX45201559 Autre projet"],
  ["PX4520155", "PX4520155", "PX4520155"],
  ["[PX4520155]", "PX4520155", "[PX4520155]"],
  ["Modernisation atelier", null, "Modernisation atelier"],
  ["Modernisation atelier", "", "Modernisation atelier"],
  ["MEWTBN7Q - Étude connectivité", "MEWTBN7Q", "Étude connectivité"],
  ["A.B+1 - Nom avec code spécial", "A.B+1", "Nom avec code spécial"],
];

test("stripCode removes the code token wherever it appears and tidies the seams", () => {
  for (const [name, code, expected] of CASES) {
    assert.equal(stripCode(name, code), expected, `${name} / ${code ?? "null"}`);
  }
});
