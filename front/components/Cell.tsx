// One lane-column cell (design board.jsx Cell): WIP heat + blocked count
// in the head, gate line on gated columns, then the cards — expanded when
// the column is focused, radiator bars otherwise — and the scroll hint (a
// fading down-arrow while the cell can scroll further, design v11). The
// cell is the drop target of the drag-and-drop flow.

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import type { BoardConfig, CardState, Column, GateDef, Lane } from "../../core/types.ts";
import { wipDisplay, wipState } from "../../core/board.ts";
import { FocusCard, MiniCard } from "./cards.tsx";

/** Props of one cell (pinned build-spec contract). */
export interface CellProps {
  lane: Lane;
  column: Column;
  /** The cards of THIS cell only (BoardGrid filters via core cellCards). */
  cards: CardState[];
  dimmedIds: Set<string>;
  focused: boolean;
  config: BoardConfig;
  /** Epoch milliseconds of the shared "now" tick. */
  now: number;
  showCodes: boolean;
  /** True when a dragged card is currently over this cell. */
  dragOver: boolean;
  /** The gate definition of the column, or null when ungated. */
  gateDef: GateDef | null;
  onOpen: (card: CardState) => void;
  onDragStart: (e: DragEvent, card: CardState) => void;
  onDragEnd: () => void;
  onDrop: (e: DragEvent, laneId: string, columnId: string) => void;
  onDragOverCell: (e: DragEvent, laneId: string, columnId: string) => void;
  onDragLeaveCell: () => void;
  /** Card-level drag plumbing (insert-before reorder, ADR 019). */
  onCardOver: (e: DragEvent, card: CardState) => void;
  onCardDrop: (e: DragEvent, card: CardState) => void;
  /** Id of the card currently marked as the insertion target, or null. */
  dropCardId: string | null;
}

// Scroll hint: true while the card list can scroll further down, recomputed
// on scroll and on any resize of the list or its children (design v11 —
// ResizeObserver, so a board resize or filter change updates it too).
function useScrollHint(count: number, focused: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setHint(el.scrollHeight - el.clientHeight - el.scrollTop > 4);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    el.addEventListener("scroll", update);
    return () => { observer.disconnect(); el.removeEventListener("scroll", update); };
  }, [count, focused]);
  return { ref, hint };
}

// The card stack of the cell; a focused column shows expanded cards. An
// empty cell keeps a filler so the drop target spans the full height.
function CellCardList({ props, listRef }: { props: CellProps; listRef: React.Ref<HTMLDivElement> }) {
  const shared = {
    now: props.now,
    config: props.config,
    showCodes: props.showCodes,
    onOpen: props.onOpen,
    onDragStart: props.onDragStart,
    onDragEnd: props.onDragEnd,
    onCardOver: props.onCardOver,
    onCardDrop: props.onCardDrop,
  };
  return (
    <div className="cell-cards" ref={listRef}>
      {props.cards.map((card) =>
        props.focused ? (
          <FocusCard key={card.id} card={card} dimmed={props.dimmedIds.has(card.id)}
            dropTarget={props.dropCardId === card.id} {...shared} />
        ) : (
          <MiniCard key={card.id} card={card} dimmed={props.dimmedIds.has(card.id)}
            dropTarget={props.dropCardId === card.id} {...shared} />
        ),
      )}
      {props.cards.length === 0 && <span className="cell-empty" />}
    </div>
  );
}

/**
 * One lane-column cell: drop target with WIP heat (data-wip attribute +
 * read-out via core/board), blocked count badge, gate line and the card
 * list (FocusCard when the column is focused, MiniCard otherwise).
 * Inputs: CellProps — cards come in already cell-filtered.
 * Output: the .cell element wired to the drag callbacks.
 * Failure modes: none.
 */
export function Cell(props: CellProps) {
  const { lane, column, cards, gateDef } = props;
  const wip = wipState(cards.length, column.wip);
  const blockedCount = cards.filter((card) => card.blocked).length;
  const scroll = useScrollHint(cards.length, props.focused);
  return (
    <div
      className={"cell" + (props.focused ? " focused" : "") + (props.dragOver ? " dragover" : "")}
      data-wip={wip}
      onDragOver={(e) => props.onDragOverCell(e, lane.id, column.id)}
      onDragLeave={props.onDragLeaveCell}
      onDrop={(e) => props.onDrop(e, lane.id, column.id)}
    >
      {gateDef !== null && column.gate !== null && (
        <span
          className="gate-line"
          style={{ "--gate": gateDef.color } as CSSProperties}
          title={`${column.gate} — ${gateDef.name}`}
        />
      )}
      <div className="cell-head">
        <span className={"wip " + wip}>{wipDisplay(cards.length, column.wip)}</span>
        {blockedCount > 0 && <span className="cell-blocked">{blockedCount}</span>}
      </div>
      <CellCardList props={props} listRef={scroll.ref} />
      <span className={"scroll-hint" + (scroll.hint ? " on" : "")} aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    </div>
  );
}
