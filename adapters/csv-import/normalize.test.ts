// Table-driven checks of the label normalization the whole import parser
// relies on (header matching, domain resolution, name merging).

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeLabel } from "./normalize.ts";

const BOM = String.fromCharCode(0xfeff);
const NBSP = String.fromCharCode(0xa0);

const CASES: Array<[string, string, string]> = [
  ["accents stripped", "Ingénierie", "ingenierie"],
  ["case folded", "CYBER", "cyber"],
  ["trimmed", "  Infra  ", "infra"],
  ["inner whitespace collapsed", "Archi \t &  Dev", "archi & dev"],
  ["non-breaking space collapsed", `Archi${NBSP}&${NBSP}Dev`, "archi & dev"],
  ["BOM stripped", `${BOM}Domaine`, "domaine"],
  ["typographic apostrophe unified", "Gestion d’obsolescence", "gestion d'obsolescence"],
  ["oe ligature expanded", "Œuvre", "oeuvre"],
  ["ae ligature expanded", "Ægide", "aegide"],
  ["cedilla and grave", "Reçu à", "recu a"],
  ["empty stays empty", "", ""],
  ["whitespace-only collapses to empty", " \t ", ""],
];

test("normalizeLabel canonical forms", () => {
  for (const [label, input, expected] of CASES) {
    assert.equal(normalizeLabel(input), expected, label);
  }
});

test("normalizeLabel is idempotent", () => {
  for (const [label, input] of CASES) {
    const once = normalizeLabel(input);
    assert.equal(normalizeLabel(once), once, label);
  }
});
