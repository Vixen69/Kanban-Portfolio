// grid.jsx
// Board assembly: column headers (click to focus a stage), vertical lane labels
// (click to collapse a canal), collapsed summary cells, and the grid itself.

const { useState: useStateGrid, useRef: useRefGrid } = React;

// --- Popover listing the tickets inside a collapsed cell. Opens a ticket in one click.
//     Positioned fixed off the cell's rect so it escapes the board's overflow clipping. ---
function CollapsedTicketList({ anchorRect, list, onOpen, onClose }) {
  if (!anchorRect) return null;
  const belowSpace = window.innerHeight - anchorRect.bottom;
  const openUp = belowSpace < 220 && anchorRect.top > belowSpace;
  const style = {
    position: 'fixed',
    left: Math.min(anchorRect.left, window.innerWidth - 268),
    width: 252,
    zIndex: 60,
    ...(openUp ? { bottom: window.innerHeight - anchorRect.top + 4 } : { top: anchorRect.bottom + 4 }),
  };
  return (
    <div className="cpop" style={style} onMouseLeave={onClose}>
      <div className="cpop-head">{list.length} sujet{list.length > 1 ? 's' : ''}</div>
      <div className="cpop-list">
        {list.map(card => {
          const tp = TYPE_BY_ID[card.type];
          return (
            <button className="cpop-row" key={card.id} onClick={(e) => { e.stopPropagation(); onClose(); onOpen(card); }} title={'Ouvrir · ' + card.name}>
              {tp && <span className="cpop-type" style={{ background: tp.color }}>{tp.short}</span>}
              <span className="cpop-name">{card.name}</span>
              {card.blocked && <span className="cpop-blk" title="Bloqué">{'!'}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- Column header. Click body = focus the stage; click caret = collapse to a strip. ---
function ColumnHeader({ col, focused, colCollapsed, onFocus, onToggleCollapse }) {
  const gate = GATES[col.id];
  if (colCollapsed) {
    return (
      <div className="col-head col-collapsed" onClick={() => onToggleCollapse(col.id)} title={'Déplier ' + col.label}>
        <span className="collapse-caret">{'›'}</span>
        <span className="col-label-v">{col.label}</span>
      </div>
    );
  }
  return (
    <div className={'col-head' + (focused ? ' focused' : '')} onClick={() => onFocus(col.id)} title="Cliquer pour focaliser ce stade">
      <div className="col-head-top">
        <span className="col-label">{col.label}</span>
        {gate && <span className="gate-badge" style={{ '--gate': gate.color }}>{gate.code}</span>}
        <button className="col-collapse" onClick={(e) => { e.stopPropagation(); onToggleCollapse(col.id); }} title={'Replier ' + col.label}>{'‹'}</button>
      </div>
      <span className="col-note">{col.note}</span>
    </div>
  );
}

// --- Vertical lane label. Clicking anywhere on the row label collapses/expands the canal. ---
function LaneLabel({ lane, collapsed, disabled, onToggle }) {
  return (
    <div className={'lane-label' + (collapsed ? ' collapsed' : '') + (disabled ? ' no-collapse' : '')} onClick={disabled ? undefined : onToggle} title={disabled ? 'Au moins une ligne doit rester dépliée' : (collapsed ? ('Déplier ' + lane.label) : ('Replier ' + lane.label))}>
      {!disabled && <span className="collapse-caret">{collapsed ? '▸' : '▾'}</span>}
      <span className="lane-name">{lane.label}</span>
      {!collapsed && <span className="lane-nature">{lane.nature}</span>}
    </div>
  );
}

// --- Collapsed cell: signals at a glance + hover popover to open any ticket in one click. ---
function CollapsedCell({ cards, lane, col, onOpen }) {
  const list = cards.filter(c => c.canal === lane.id && c.column === col.id);
  const blk = list.filter(c => c.blocked).length;
  const stale = list.filter(c => daysInColumn(c) > 60).length;
  const [rect, setRect] = useStateGrid(null);
  const open = (e) => { if (list.length) setRect(e.currentTarget.getBoundingClientRect()); };
  return (
    <div className={'ccell' + (list.length ? ' has' : '')} onMouseEnter={open} onClick={open}>
      <span className="ccount">{list.length || ''}</span>
      {blk > 0 && <span className="cblk">{blk}</span>}
      {stale > 0 && <span className="cstale" title={stale + ' stagnant(s)'} />}
      {rect && <CollapsedTicketList anchorRect={rect} list={list} onOpen={onOpen} onClose={() => setRect(null)} />}
    </div>
  );
}

// --- Collapsed COLUMN cell: narrow strip; same one-click ticket popover. ---
function CollapsedColCell({ cards, lane, col, onOpen }) {
  const list = cards.filter(c => c.canal === lane.id && c.column === col.id);
  const blk = list.filter(c => c.blocked).length;
  const [rect, setRect] = useStateGrid(null);
  const open = (e) => { if (list.length) setRect(e.currentTarget.getBoundingClientRect()); };
  return (
    <div className={'ccol-cell' + (list.length ? ' has' : '')} onMouseEnter={open} onClick={open}>
      <span className="ccount">{list.length || ''}</span>
      {blk > 0 && <span className="cblk">{blk}</span>}
      {rect && <CollapsedTicketList anchorRect={rect} list={list} onOpen={onOpen} onClose={() => setRect(null)} />}
    </div>
  );
}

// --- The whole grid. One CSS grid; focus widens a column, collapse shrinks a row/column. ---
function BoardGrid({ cards, focusedColumn, collapsed, collapsedCols, t, wipLimits, onSetWip, showCodes, dragOver, onFocusColumn, onToggleLane, onToggleColumnCollapse, onOpen, onOpenDirect, onDragStart, onDragEnd, onDrop, onDragOverCell, onDragLeaveCell, onCardOver, onCardDrop, dropCardId }) {
  const colWeights = COLUMNS.map(c =>
    collapsedCols.has(c.id) ? '30px'
      : c.id === focusedColumn ? '2.6fr'
      : focusedColumn ? '0.62fr'
      : '1fr'
  );
  const gridTemplateColumns = `var(--lane-w) ${colWeights.join(' ')}`;
  const gridTemplateRows = ['auto', ...SWIMLANES.map(l => collapsed.has(l.id) ? '26px' : '1fr')].join(' ');

  return (
    <div className="board" style={{ gridTemplateColumns, gridTemplateRows }}>
      <div className="corner" />
      {COLUMNS.map(col => (
        <ColumnHeader key={col.id} col={col} focused={focusedColumn === col.id} colCollapsed={collapsedCols.has(col.id)} onFocus={onFocusColumn} onToggleCollapse={onToggleColumnCollapse} />
      ))}
      {SWIMLANES.map(lane => {
        const isCollapsed = collapsed.has(lane.id);
        return (
          <React.Fragment key={lane.id}>
            <LaneLabel lane={lane} collapsed={isCollapsed} disabled={!isCollapsed && collapsed.size >= SWIMLANES.length - 1} onToggle={() => onToggleLane(lane.id)} />
            {COLUMNS.map(col =>
              isCollapsed
                ? <CollapsedCell key={col.id} cards={cards} lane={lane} col={col} onOpen={onOpenDirect} />
                : collapsedCols.has(col.id)
                ? <CollapsedColCell key={col.id} cards={cards} lane={lane} col={col} onOpen={onOpenDirect} />
                : (
                  <Cell
                    key={col.id}
                    lane={lane}
                    column={col}
                    cards={cards}
                    focused={focusedColumn === col.id}
                    t={t}
                    wipLimit={wipLimits ? wipLimits[lane.id + ':' + col.id] : col.wip}
                    onSetWip={onSetWip}
                    showCodes={showCodes}
                    dragOver={!!dragOver && dragOver.lane === lane.id && dragOver.column === col.id}
                    onOpen={onOpen}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onDrop={onDrop}
                    onDragOverCell={onDragOverCell}
                    onDragLeaveCell={onDragLeaveCell}
                    onCardOver={onCardOver}
                    onCardDrop={onCardDrop}
                    dropCardId={dropCardId}
                  />
                )
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

Object.assign(window, { ColumnHeader, LaneLabel, CollapsedCell, CollapsedColCell, BoardGrid });
