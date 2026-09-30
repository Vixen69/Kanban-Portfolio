// Moving from one card to the next in its cell with the arrows, the fiche
// open (author, 2026-09-29: « naviguer entre les cartes de la case avec
// gauche-droite »). The order is the one on screen — the manual order, or
// the sort in force (ADR 044) — and only the cards the filters and the
// métier lens keep (ADR 031/048). A canal-less column (ADR 039) is one cell.

import { useEffect, useMemo } from "react";
import type { BoardConfig, CardState } from "../core/types.ts";
import { unifiedColumnIds } from "../core/layout.ts";

/** The fiche's place in its cell and the two moves. */
export interface CellNav {
  /** 1-based position of the open card in its cell. */
  position: number;
  total: number;
  /** The cell in words: « Actifs · Projets », or the column alone. */
  label: string;
  /** Opens the previous / next card of the cell; null at either end. */
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}

/**
 * The visible cards of a card's cell, in the board's order.
 * Inputs: the board's cards (display order), the hidden ids, the open card,
 * the canal-less column ids. Output: the cell's cards, the open one
 * included — empty when the open card itself is hidden or not on the board.
 * Failure: none.
 */
export function cellSiblings(
  cards: readonly CardState[], hidden: ReadonlySet<string>, card: CardState, unified: ReadonlySet<string>,
): CardState[] {
  if (hidden.has(card.id) || !cards.some((entry) => entry.id === card.id)) return [];
  const sameCell = (entry: CardState) =>
    entry.columnId === card.columnId && (unified.has(card.columnId) || entry.laneId === card.laneId);
  return cards.filter((entry) => !hidden.has(entry.id) && sameCell(entry));
}

// The cell of a card in words, from the config's names.
function cellLabel(config: BoardConfig, card: CardState, unified: ReadonlySet<string>): string {
  const column = config.columns.find((entry) => entry.id === card.columnId)?.name ?? card.columnId;
  if (unified.has(card.columnId)) return column;
  const lane = config.lanes.find((entry) => entry.id === card.laneId)?.name ?? card.laneId;
  return `${column} · ${lane}`;
}

/**
 * The open fiche's navigation within its cell.
 * Inputs: the board's cards, the hidden ids, the config, the open card (or
 * null), the callback that opens a card by id. Output: the CellNav, or null
 * when no card is open or it is not on the board (an archived fiche outside
 * a closed year — a closed year's archived cards stay on its board, ADR 038).
 * Failure: none.
 */
export function useCellNav(
  cards: readonly CardState[], hidden: ReadonlySet<string>, config: BoardConfig,
  card: CardState | null, open: (id: string) => void,
): CellNav | null {
  const unified = useMemo(() => unifiedColumnIds(config), [config]);
  return useMemo(() => {
    if (card === null) return null;
    const cell = cellSiblings(cards, hidden, card, unified);
    const index = cell.findIndex((entry) => entry.id === card.id);
    if (index < 0) return null;
    const prev = cell[index - 1];
    const next = cell[index + 1];
    return {
      position: index + 1, total: cell.length, label: cellLabel(config, card, unified),
      onPrev: prev === undefined ? null : () => open(prev.id),
      onNext: next === undefined ? null : () => open(next.id),
    };
  }, [cards, hidden, config, card, unified, open]);
}

// True when the key belongs to a field being typed in.
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

// True while an editor of the fiche holds a draft a move would drop: the
// blocking and checklist forms, the fiche « Décision et Raison »
// (ADR 052), or an unsent comment.
function draftOpen(): boolean {
  if (document.querySelector(".modal .block-form, .modal .charge-editor, .modal.fd") !== null) return true;
  const comment = document.querySelector<HTMLInputElement>(".modal .cm-add input");
  return comment !== null && comment.value.trim() !== "";
}

/**
 * ← and → move through the cell while the fiche is open — never while a
 * field is being typed in, while a form of the fiche holds a draft, or
 * with a modifier key.
 * Input: the CellNav (null: nothing is listened to). Output: none.
 * Failure: none.
 */
export function useArrowKeys(nav: CellNav | null): void {
  useEffect(() => {
    if (nav === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || typing(event.target) || draftOpen()) return;
      const move = event.key === "ArrowLeft" ? nav.onPrev : event.key === "ArrowRight" ? nav.onNext : null;
      if (move === null) return;
      event.preventDefault();
      move();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);
}
