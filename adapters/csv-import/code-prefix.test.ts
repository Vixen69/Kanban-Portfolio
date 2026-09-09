// The leading project code leaves the title, whatever the separator or
// the brackets around it; nothing else in the name is touched.

import { test } from "node:test";
import assert from "node:assert/strict";
import { stripCodePrefix } from "./code-prefix.ts";

const CASES: Array<[string, string | null, string]> = [
  ["PX4520155 - Modernisation atelier", "PX4520155", "Modernisation atelier"],
  ["PX4520155 Modernisation atelier", "PX4520155", "Modernisation atelier"],
  ["PX4520155 : Modernisation atelier", "PX4520155", "Modernisation atelier"],
  ["px4520155_Modernisation atelier", "PX4520155", "Modernisation atelier"],
  ["[PX4520155] Modernisation atelier", "PX4520155", "Modernisation atelier"],
  ["(PX4520155) Modernisation atelier", "PX4520155", "Modernisation atelier"],
  ["  PX4520155 — Modernisation atelier  ", "PX4520155", "Modernisation atelier"],
  ["PE10001 - Portail (PE10001)", "PE10001", "Portail (PE10001)"],
  ["Modernisation atelier PX4520155", "PX4520155", "Modernisation atelier PX4520155"],
  ["PX45201559 Autre projet", "PX4520155", "PX45201559 Autre projet"],
  ["PX4520155", "PX4520155", "PX4520155"],
  ["[PX4520155]", "PX4520155", "[PX4520155]"],
  ["Modernisation atelier", null, "Modernisation atelier"],
  ["Modernisation atelier", "", "Modernisation atelier"],
  ["MEWTBN7Q - Étude connectivité", "MEWTBN7Q", "Étude connectivité"],
  ["A.B+1 - Nom avec code spécial", "A.B+1", "Nom avec code spécial"],
];

test("stripCodePrefix removes the leading code and its separators, keeps everything else", () => {
  for (const [name, code, expected] of CASES) {
    assert.equal(stripCodePrefix(name, code), expected, `${name} / ${code ?? "null"}`);
  }
});
