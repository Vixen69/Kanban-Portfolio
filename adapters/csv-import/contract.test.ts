// Checks of the header-contract engine: tolerant recognition (case,
// accents, BOM, order), precise deviation reporting, near-miss vs unknown.

import { test } from "node:test";
import assert from "node:assert/strict";
import { identifyHeader, RDOM_CONTRACT } from "./contract.ts";

const BOM = String.fromCharCode(0xfeff);

test("exact RDOM header matches with column positions", () => {
  const result = identifyHeader(["Domaine", "Nom"]);
  assert.equal(result.status, "match");
  if (result.status !== "match") return;
  assert.equal(result.contract.id, RDOM_CONTRACT.id);
  assert.equal(result.columnIndex.get("Domaine"), 0);
  assert.equal(result.columnIndex.get("Nom"), 1);
  assert.deepEqual(result.deviations, []);
});

test("case, spacing, accents and a leaked BOM are tolerated", () => {
  const result = identifyHeader([` ${BOM}DOMAINE `, "nom"]);
  assert.equal(result.status, "match");
});

test("reordered columns match with swapped indices, no deviation", () => {
  const result = identifyHeader(["Nom", "Domaine"]);
  assert.equal(result.status, "match");
  if (result.status !== "match") return;
  assert.equal(result.columnIndex.get("Domaine"), 1);
  assert.equal(result.columnIndex.get("Nom"), 0);
  assert.deepEqual(result.deviations, []);
});

test("an extra column still matches and is reported", () => {
  const result = identifyHeader(["Domaine", "Nom", "Commentaire"]);
  assert.equal(result.status, "match");
  if (result.status !== "match") return;
  assert.deepEqual(result.deviations, [{ kind: "extra", column: "Commentaire" }]);
});

test("a trailing empty header cell is reported as an empty extra column", () => {
  const result = identifyHeader(["Domaine", "Nom", ""]);
  assert.equal(result.status, "match");
  if (result.status !== "match") return;
  assert.deepEqual(result.deviations, [{ kind: "extra", column: "(colonne vide)" }]);
});

test("a duplicated column matches on its first occurrence and is reported", () => {
  const result = identifyHeader(["Domaine", "Nom", "Nom"]);
  assert.equal(result.status, "match");
  if (result.status !== "match") return;
  assert.equal(result.columnIndex.get("Nom"), 1);
  assert.deepEqual(result.deviations, [{ kind: "duplicate", column: "Nom" }]);
});

test("a missing column is a near-miss with the precise missing list", () => {
  const result = identifyHeader(["Domaine"]);
  assert.equal(result.status, "near-miss");
  if (result.status !== "near-miss") return;
  assert.equal(result.contract.id, RDOM_CONTRACT.id);
  assert.deepEqual(result.missing, ["Nom"]);
});

test("alien or empty headers are unknown", () => {
  assert.equal(identifyHeader(["Projet", "Budget"]).status, "unknown");
  assert.equal(identifyHeader([]).status, "unknown");
  assert.equal(identifyHeader([""]).status, "unknown");
});
