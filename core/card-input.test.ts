// Hand-entered card values (ADR 057): the decimal reading of an amount and
// the custom field check shared by the forms and the middle.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { FieldDef } from "./config-types.ts";
import { CARD_TEXT_LIMITS, customValueFits, parseAmount } from "./card-input.ts";

test("parseAmount reads a comma or a dot, refuses blank, junk and negatives", () => {
  const cases: [string, number | null][] = [
    ["36.5", 36.5],
    ["36,5", 36.5],
    [" 12,75 ", 12.75],
    ["0", 0],
    ["40", 40],
    ["", null],
    ["   ", null],
    ["abc", null],
    ["-3", null],
    ["Infinity", null],
  ];
  for (const [raw, expected] of cases) assert.equal(parseAmount(raw), expected, raw);
});

const FIELDS: Record<string, FieldDef> = {
  num: { id: "f_num", name: "Nombre", type: "number", showOnCard: false },
  sel: { id: "f_sel", name: "Choix", type: "select", showOnCard: false, options: [{ label: "Oui", color: "#000" }, { label: "Non", color: "#000" }] },
  date: { id: "f_date", name: "Date", type: "date", showOnCard: false },
  box: { id: "f_box", name: "Case", type: "checkbox", showOnCard: false },
  text: { id: "f_text", name: "Texte", type: "text", showOnCard: false },
  person: { id: "f_person", name: "Personne", type: "person", showOnCard: false },
};

test("customValueFits checks a value against its field's declared type", () => {
  const cases: [keyof typeof FIELDS, unknown, boolean][] = [
    ["num", 12.5, true],
    ["num", "", false],
    ["num", "12", false],
    ["num", Number.NaN, false],
    ["sel", "Oui", true],
    ["sel", "Peut-être", false],
    ["date", "2026-12-15", true],
    ["date", "2026-02-30", false],
    ["date", "2026-12-15T00:00:00.000Z", false],
    ["box", true, true],
    ["box", "true", false],
    ["text", "libre", true],
    ["text", "x".repeat(CARD_TEXT_LIMITS.customText), true],
    ["text", "x".repeat(CARD_TEXT_LIMITS.customText + 1), false],
    ["person", 42, false],
  ];
  for (const [key, value, fits] of cases) {
    assert.equal(customValueFits(FIELDS[key]!, value), fits, `${key} ← ${JSON.stringify(value)}`);
  }
  for (const field of Object.values(FIELDS)) assert.equal(customValueFits(field, null), true, `${field.type} vidé`);
});
