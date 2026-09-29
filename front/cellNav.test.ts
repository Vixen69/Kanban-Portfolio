// Moving through a card's cell with the arrows (author, 2026-09-29): the
// order on screen, the visible cards only, a canal-less column as one cell.

import { test } from "node:test";
import assert from "node:assert/strict";
import { foldEvents } from "../core/state.ts";
import { testCard } from "../core/test-helpers.ts";
import type { Card, CardState } from "../core/types.ts";
import { cellSiblings } from "./cellNav.ts";

function state(overrides: Partial<Card>): CardState {
  return foldEvents([testCard(overrides)], [])[0]!;
}

const A = state({ id: "A", laneId: "laneA", columnId: "col3" });
const B = state({ id: "B", laneId: "laneB", columnId: "col3" });
const C = state({ id: "C", laneId: "laneA", columnId: "col3" });
const D = state({ id: "D", laneId: "laneA", columnId: "col2" });
const E = state({ id: "E", laneId: "laneA", columnId: "col3" });
const CARDS = [C, A, B, D, E];
const ids = (cards: CardState[]) => cards.map((card) => card.id).join("");

test("cellSiblings: the same canal and column, in the board's order", () => {
  assert.equal(ids(cellSiblings(CARDS, new Set(), A, new Set())), "CAE");
  assert.equal(ids(cellSiblings(CARDS, new Set(), B, new Set())), "B");
});

test("cellSiblings: hidden cards are skipped; a hidden or absent open card has no cell", () => {
  assert.equal(ids(cellSiblings(CARDS, new Set(["A"]), C, new Set())), "CE");
  assert.equal(ids(cellSiblings(CARDS, new Set(["C"]), C, new Set())), "");
  assert.equal(ids(cellSiblings([A, E], new Set(), C, new Set())), "", "an archived fiche is not on the board");
});

test("cellSiblings: a canal-less column is one cell whatever the canal", () => {
  assert.equal(ids(cellSiblings(CARDS, new Set(), A, new Set(["col3"]))), "CABE");
});
