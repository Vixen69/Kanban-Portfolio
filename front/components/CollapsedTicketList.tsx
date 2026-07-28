// Popover listing the tickets inside a collapsed cell (design v11
// grid.jsx): one click opens a card without expanding the lane or column.
// Positioned fixed off the cell's rect so it escapes the board's overflow
// clipping; flips upward when the space below is short.

import type { BoardConfig, CardState } from "../../core/types.ts";
import { typeById } from "../lookup.ts";

/** Props of the collapsed-cell ticket popover. */
export interface CollapsedTicketListProps {
  /** The collapsed cell's bounding rect (viewport coordinates). */
  anchorRect: DOMRect;
  /** The cards of that cell (pre-filtered). */
  list: CardState[];
  config: BoardConfig;
  onOpen: (card: CardState) => void;
  onClose: () => void;
}

/**
 * The ticket popover of a collapsed cell: count header + one row per card
 * (type badge, name, blocked mark). Clicking a row closes the popover and
 * opens the card detail; leaving the popover closes it.
 * Inputs: CollapsedTicketListProps. Output: the fixed-position div.cpop.
 * Failure modes: none.
 */
export function CollapsedTicketList({ anchorRect, list, config, onOpen, onClose }: CollapsedTicketListProps) {
  const types = typeById(config);
  const belowSpace = window.innerHeight - anchorRect.bottom;
  const openUp = belowSpace < 220 && anchorRect.top > belowSpace;
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(anchorRect.left, window.innerWidth - 268),
    width: 252,
    zIndex: 60,
    ...(openUp ? { bottom: window.innerHeight - anchorRect.top + 4 } : { top: anchorRect.bottom + 4 }),
  };
  return (
    <div className="cpop" style={style} onMouseLeave={onClose}>
      <div className="cpop-head">{list.length} sujet{list.length > 1 ? "s" : ""}</div>
      <div className="cpop-list">
        {list.map((card) => {
          const type = card.typeId === null ? undefined : types[card.typeId];
          return (
            <button className="cpop-row" key={card.id} title={"Ouvrir · " + card.title}
              onClick={(event) => { event.stopPropagation(); onClose(); onOpen(card); }}>
              {type && <span className="cpop-type" style={{ background: type.color }}>{type.short}</span>}
              <span className="cpop-name">{card.title}</span>
              {card.blocked && <span className="cpop-blk" title="Bloqué">!</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
