// Card movement and keyboard card-navigation: drag-drop + Ctrl+arrow move,
// and plain-arrow selection between cards. Both read the arrow→direction map.

import { useCallback, useEffect } from "react";
import type { BoardConfig, CardState } from "../../core/types.ts";
import { neighbourCell } from "../../core/board.ts";
import type { BoardStore } from "../useBoardStore.ts";
import type { CellRef } from "../components/Cell.tsx";

const ARROW_DIRECTIONS: Record<string, "left" | "right" | "up" | "down"> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

function refocusCard(cardId: string): void {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`[data-card-id="${cardId}"]`)?.focus();
  });
}

/**
 * Card movement: drop from drag & drop, and the Ctrl+arrow keyboard
 * fallback (moves to the neighbouring cell, then restores focus).
 * Inputs: the board config and the store. Output: onDrop and onMoveKey.
 * Failure: none — moves at the board edge are silently ignored.
 */
export function useCardMovement(config: BoardConfig, store: BoardStore) {
  const onDrop = useCallback(
    (cardId: string, to: CellRef) => store.moveCard(cardId, to),
    [store],
  );
  const onMoveKey = useCallback(
    (cardId: string, key: string) => {
      const direction = ARROW_DIRECTIONS[key];
      const card = store.cards.find((state) => state.id === cardId);
      if (!direction || !card) return;
      const target = neighbourCell(config, card.laneId, card.columnId, direction);
      if (!target) return;
      store.moveCard(cardId, target);
      refocusCard(cardId);
    },
    [config, store],
  );
  return { onDrop, onMoveKey };
}

function focusSiblingCard(card: HTMLElement, direction: "up" | "down"): void {
  const cell = card.closest(".cell");
  if (!cell) return;
  const all = [...cell.querySelectorAll<HTMLElement>("[data-card-id]")];
  const next = all[all.indexOf(card) + (direction === "down" ? 1 : -1)];
  next?.focus();
}

function focusNeighbourCellCard(
  config: BoardConfig,
  cards: CardState[],
  cardId: string,
  direction: "left" | "right",
): void {
  const card = cards.find((state) => state.id === cardId);
  if (!card) return;
  const target = neighbourCell(config, card.laneId, card.columnId, direction);
  if (!target) return;
  document
    .querySelector<HTMLElement>(
      `.cell[data-lane-id="${target.laneId}"][data-column-id="${target.columnId}"] [data-card-id]`,
    )
    ?.focus();
}

/**
 * Keyboard navigation between cards (Sprint 2): with a card focused,
 * plain arrows move the SELECTION — up/down within the cell, left/right
 * to the neighbouring column's first card (Ctrl+arrows still move the
 * card itself). Inputs: the board config and the current card states.
 * Output: none (effect only). Failure: none — edges and empty target
 * cells are silently ignored.
 */
export function useCardNavigation(config: BoardConfig, cards: CardState[]) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const direction = ARROW_DIRECTIONS[event.key];
      if (!direction) return;
      const active = document.activeElement as HTMLElement | null;
      const cardId = active?.dataset["cardId"];
      if (!active || !cardId) return;
      event.preventDefault();
      if (direction === "up" || direction === "down") focusSiblingCard(active, direction);
      else focusNeighbourCellCard(config, cards, cardId, direction);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [config, cards]);
}
