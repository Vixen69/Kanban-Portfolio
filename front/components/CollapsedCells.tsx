// The two collapsed-cell variants of the board (design v11): a collapsed
// canal's summary cell and a collapsed column's narrow strip. Both open the
// same one-click ticket popover. Split out of BoardGrid.tsx to hold the
// 300-line file cap once the v12 totals moved in.

import { useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import type { BoardConfig, CardState } from "../../core/types.ts";
import { isStale } from "../../core/aging.ts";
import { CollapsedTicketList } from "./CollapsedTicketList.tsx";

// Rect state + open handler shared by the two collapsed-cell variants:
// hover or click anchors the ticket popover on the cell (design v11). The
// popover is a DOM child of the cell, so the cell's mouseleave fires only
// once the pointer has left BOTH (author, 2026-09-24: leaving the collapsed
// column must close the list; going down into it must keep it).
function useCellPopover(count: number) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const open = (event: React.MouseEvent<HTMLDivElement>) => {
    if (count > 0) setRect(event.currentTarget.getBoundingClientRect());
  };
  return { rect, open, close: () => setRect(null) };
}

/**
 * Collapsed-lane summary cell: the signals that matter at a glance, plus
 * the one-click ticket popover on hover/click (design v11).
 * Inputs: the cards of this cell (pre-filtered), the config (stale
 * threshold + type badges), now in epoch ms, the open-card callback.
 * Output: count (empty when zero), blocked badge, stagnation dot.
 * Failure modes: none.
 */
export function CollapsedCell({ cards, config, now, onOpen }: {
  cards: CardState[];
  config: BoardConfig;
  now: number;
  onOpen: (card: CardState) => void;
}) {
  const date = new Date(now);
  const blocked = cards.filter((card) => card.blocked).length;
  const stale = cards.filter((card) => isStale(card, config, date)).length;
  const pop = useCellPopover(cards.length);
  return (
    <div className={"ccell" + (cards.length ? " has" : "")} onMouseEnter={pop.open} onMouseLeave={pop.close} onClick={pop.open}>
      <span className="ccount">{cards.length || ""}</span>
      {blocked > 0 && <span className="cblk">{blocked}</span>}
      {stale > 0 && <span className="cstale" title={stale + " stagnant(s)"} />}
      {pop.rect && <CollapsedTicketList anchorRect={pop.rect} list={cards} config={config} now={now} onOpen={onOpen} onClose={pop.close} />}
    </div>
  );
}

/**
 * Collapsed-column strip cell: count and blocked badge, plus the same
 * one-click ticket popover (design v11) — and a drop target: Pause starts
 * collapsed, and a card dropped on its strip goes into Pause (ADR 052).
 * Inputs: the cards of this cell (pre-filtered), the config, the
 * open-card callback, the drop callbacks. Output: the narrow strip content.
 * Failure modes: none.
 */
export function CollapsedColCell({ cards, config, now, onOpen, style, onDragOver, onDrop }: {
  cards: CardState[];
  config: BoardConfig;
  /** Epoch ms: the pause marks of the ticket list (ADR 052). */
  now: number;
  onOpen: (card: CardState) => void;
  /** Grid placement (a unified column's strip spans the lane rows, ADR 039). */
  style?: CSSProperties;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
}) {
  const blocked = cards.filter((card) => card.blocked).length;
  const pop = useCellPopover(cards.length);
  const [over, setOver] = useState(false);
  return (
    <div className={"ccol-cell" + (cards.length ? " has" : "") + (over ? " dragover" : "")} style={style}
      onMouseEnter={pop.open} onMouseLeave={pop.close} onClick={pop.open}
      onDragOver={(event) => { setOver(true); onDragOver(event); }} onDragLeave={() => setOver(false)}
      onDrop={(event) => { setOver(false); onDrop(event); }}>
      <span className="ccount">{cards.length || ""}</span>
      {blocked > 0 && <span className="cblk">{blocked}</span>}
      {pop.rect && <CollapsedTicketList anchorRect={pop.rect} list={cards} config={config} now={now} onOpen={onOpen} onClose={pop.close} />}
    </div>
  );
}
