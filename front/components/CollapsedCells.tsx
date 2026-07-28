// The two collapsed-cell variants of the board (design v11): a collapsed
// canal's summary cell and a collapsed column's narrow strip. Both open the
// same one-click ticket popover. Split out of BoardGrid.tsx to hold the
// 300-line file cap once the v12 totals moved in.

import { useState } from "react";
import type { BoardConfig, CardState } from "../../core/types.ts";
import { isStale } from "../../core/aging.ts";
import { CollapsedTicketList } from "./CollapsedTicketList.tsx";

// Rect state + open handler shared by the two collapsed-cell variants:
// hover or click anchors the ticket popover on the cell (design v11).
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
    <div className={"ccell" + (cards.length ? " has" : "")} onMouseEnter={pop.open} onClick={pop.open}>
      <span className="ccount">{cards.length || ""}</span>
      {blocked > 0 && <span className="cblk">{blocked}</span>}
      {stale > 0 && <span className="cstale" title={stale + " stagnant(s)"} />}
      {pop.rect && <CollapsedTicketList anchorRect={pop.rect} list={cards} config={config} onOpen={onOpen} onClose={pop.close} />}
    </div>
  );
}

/**
 * Collapsed-column strip cell: count and blocked badge, plus the same
 * one-click ticket popover (design v11).
 * Inputs: the cards of this cell (pre-filtered), the config, the
 * open-card callback. Output: the narrow strip content.
 * Failure modes: none.
 */
export function CollapsedColCell({ cards, config, onOpen }: {
  cards: CardState[];
  config: BoardConfig;
  onOpen: (card: CardState) => void;
}) {
  const blocked = cards.filter((card) => card.blocked).length;
  const pop = useCellPopover(cards.length);
  return (
    <div className={"ccol-cell" + (cards.length ? " has" : "")} onMouseEnter={pop.open} onClick={pop.open}>
      <span className="ccount">{cards.length || ""}</span>
      {blocked > 0 && <span className="cblk">{blocked}</span>}
      {pop.rect && <CollapsedTicketList anchorRect={pop.rect} list={cards} config={config} onOpen={onOpen} onClose={pop.close} />}
    </div>
  );
}
