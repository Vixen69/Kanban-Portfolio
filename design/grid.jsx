// grid.jsx
// Board assembly: column headers (click to focus a stage), vertical lane labels
// (click to collapse a canal), collapsed summary cells, and the grid itself.

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

// --- Vertical lane label. Clicking collapses the canal to a summary strip. ---
function LaneLabel({ lane, collapsed, onToggle }) {
  return (
    <div className={'lane-label' + (collapsed ? ' collapsed' : '')} onClick={onToggle} title="Cliquer pour replier ce canal">
      <span className="collapse-caret">{collapsed ? '▸' : '▾'}</span>
      <span className="lane-name">{lane.label}</span>
      <span className="lane-nature">{lane.nature}</span>
    </div>
  );
}

// --- Collapsed cell: just the signals that matter at a glance. ---
function CollapsedCell({ cards, lane, col }) {
  const list = cards.filter(c => c.canal === lane.id && c.column === col.id);
  const blk = list.filter(c => c.blocked).length;
  const stale = list.filter(c => daysInColumn(c) > 60).length;
  return (
    <div className="ccell">
      <span className="ccount">{list.length || ''}</span>
      {blk > 0 && <span className="cblk">{blk}</span>}
      {stale > 0 && <span className="cstale" title={stale + ' stagnant(s)'} />}
    </div>
  );
}

// --- Collapsed COLUMN cell: a narrow strip showing just count + blocked count. ---
function CollapsedColCell({ cards, lane, col }) {
  const list = cards.filter(c => c.canal === lane.id && c.column === col.id);
  const blk = list.filter(c => c.blocked).length;
  return (
    <div className="ccol-cell">
      <span className="ccount">{list.length || ''}</span>
      {blk > 0 && <span className="cblk">{blk}</span>}
    </div>
  );
}

// --- The whole grid. One CSS grid; focus widens a column, collapse shrinks a row/column. ---
function BoardGrid({ cards, focusedColumn, collapsed, collapsedCols, t, showCodes, dragOver, onFocusColumn, onToggleLane, onToggleColumnCollapse, onOpen, onDragStart, onDragEnd, onDrop, onDragOverCell, onDragLeaveCell }) {
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
            <LaneLabel lane={lane} collapsed={isCollapsed} onToggle={() => onToggleLane(lane.id)} />
            {COLUMNS.map(col =>
              isCollapsed
                ? <CollapsedCell key={col.id} cards={cards} lane={lane} col={col} />
                : collapsedCols.has(col.id)
                ? <CollapsedColCell key={col.id} cards={cards} lane={lane} col={col} />
                : (
                  <Cell
                    key={col.id}
                    lane={lane}
                    column={col}
                    cards={cards}
                    focused={focusedColumn === col.id}
                    t={t}
                    showCodes={showCodes}
                    dragOver={!!dragOver && dragOver.lane === lane.id && dragOver.column === col.id}
                    onOpen={onOpen}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onDrop={onDrop}
                    onDragOverCell={onDragOverCell}
                    onDragLeaveCell={onDragLeaveCell}
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
