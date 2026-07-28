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
function ColumnHeader({ col, focused, colCollapsed, totals, totalsOpen, onFocus, onToggleCollapse }) {
  const gate = GATES[col.id];
  if (colCollapsed) {
    return (
      <div className="col-head col-collapsed" onClick={() => onToggleCollapse(col.id)} title={'Déplier ' + col.label}>
        <span className="collapse-caret">{'›'}</span>
        <span className="col-label-v">{col.label}</span>
      </div>
    );
  }
  const fmt = (n) => Math.round(n || 0).toLocaleString('fr-FR');
  const byRole = totals ? Object.entries(totals.byProf).map(([id, v]) => ({ id, fam: PROFILE_BY_ID[id] || { label: id, color: '#64748b' }, ...v })).filter(r => r.jh > 0).sort((a, b) => b.jh - a.jh) : [];
  return (
    <div className={'col-head' + (focused ? ' focused' : '')} onClick={() => onFocus(col.id)} title="Cliquer pour focaliser ce stade">
      <div className="col-head-top">
        <span className="col-label">{col.label}</span>
        {gate && <span className="gate-badge" style={{ '--gate': gate.color }}>{gate.code}</span>}
        <button className="col-collapse" onClick={(e) => { e.stopPropagation(); onToggleCollapse(col.id); }} title={'Replier ' + col.label}>{'‹'}</button>
      </div>
      {totals && !totalsOpen && (
        <div className="col-totals compact" title="Déplier les totaux (bouton en haut à gauche)">
          <div className="ct-row"><span>Estimé</span><b>{fmt(totals.est)}<i>k€</i></b></div>
          <div className="ct-row cap"><span>Charge</span><b>{fmt(totals.jh - totals.done)}<i>j.h RAF</i></b></div>
        </div>
      )}
      {totals && totalsOpen && (
        <div className="col-totals" title={(totals.n || 0) + ' sujet(s) affiché(s) · totaux filtrés'}>
          <div className="ct-row"><span>Enveloppe RDLI</span><b>{fmt(totals.rdli)}<i>k€</i></b></div>
          <div className="ct-row"><span>Meilleur estimé</span><b>{fmt(totals.est)}<i>k€</i></b></div>
          <div className="ct-row"><span>Engagé</span><b>{fmt(totals.eng)}<i>k€</i></b></div>
          <div className={'ct-row' + (totals.real > totals.rdli ? ' over' : '')}><span>Réalisé</span><b>{fmt(totals.real)}<i>k€</i></b></div>
          <div className="ct-row cap"><span>Plan de charge</span><b>{fmt(totals.jh - totals.done)}<i>j.h RAF</i></b></div>
          {byRole.length > 0 && (
            <div className="ct-roles">
              {byRole.map(r => (
                <div className="ct-role" key={r.id}>
                  <span className="ct-role-name"><i style={{ background: r.fam.color }} />{r.fam.label}</span>
                  <b>{fmt(r.jh - r.done)}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Vertical lane label. Clicking anywhere on the row label collapses/expands the canal. ---
function LaneLabel({ lane, collapsed, disabled, totals, totalsOpen, onToggle }) {
  const fmt = (n) => Math.round(n || 0).toLocaleString('fr-FR');
  const byRole = totals && totalsOpen ? Object.entries(totals.byProf).map(([id, v]) => ({ id, fam: (window.PROFILE_BY_ID || {})[id] || { label: id, color: '#64748b' }, ...v })).filter(r => r.jh > 0).sort((a, b) => b.jh - a.jh) : [];
  return (
    <div className={'lane-label' + (collapsed ? ' collapsed' : '') + (disabled ? ' no-collapse' : '') + (!collapsed && totalsOpen ? ' expanded' : '')} onClick={disabled ? undefined : onToggle} title={disabled ? 'Au moins une ligne doit rester dépliée' : (collapsed ? ('Déplier ' + lane.label) : ('Replier ' + lane.label))}>
      {!disabled && <span className="collapse-caret">{collapsed ? '▸' : '▾'}</span>}
      <span className="lane-name">{lane.label}</span>
      {!collapsed && !totalsOpen && <span className="lane-nature">{lane.nature}</span>}
      {!collapsed && !totalsOpen && totals && totals.n > 0 && (
        <span className="lane-totals" title={totals.n + ' sujet(s) · canal ' + lane.label}>
          <b>{fmt(totals.est)}</b>k€ · RAF <b>{fmt(totals.jh - totals.done)}</b>j.h
        </span>
      )}
      {!collapsed && totalsOpen && totals && (
        <div className="col-totals lane-col-totals" onClick={(e) => e.stopPropagation()}>
          <div className="ct-row"><span>Enveloppe RDLI</span><b>{fmt(totals.rdli)}<i>k€</i></b></div>
          <div className="ct-row"><span>Meilleur estimé</span><b>{fmt(totals.est)}<i>k€</i></b></div>
          <div className="ct-row"><span>Engagé</span><b>{fmt(totals.eng)}<i>k€</i></b></div>
          <div className={'ct-row' + (totals.real > totals.rdli ? ' over' : '')}><span>Réalisé</span><b>{fmt(totals.real)}<i>k€</i></b></div>
          <div className="ct-row cap"><span>Plan de charge</span><b>{fmt(totals.jh - totals.done)}<i>j.h RAF</i></b></div>
          {byRole.length > 0 && (
            <div className="ct-roles">
              {byRole.map(r => (
                <div className="ct-role" key={r.id}>
                  <span className="ct-role-name"><i style={{ background: r.fam.color }} />{r.fam.label}</span>
                  <b>{fmt(r.jh - r.done)}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
  // Per-column totals of the VISIBLE (filtered, non-archived) subjects — budget k€ + plan de charge j.h.
  const colTotals = {};
  COLUMNS.forEach(c => { colTotals[c.id] = { rdli: 0, est: 0, eng: 0, real: 0, jh: 0, done: 0, n: 0, byProf: {} }; });
  cards.forEach(c => {
    if (c.dimmed || c.archived || c.hidden) return;
    const tt = colTotals[c.column]; if (!tt) return;
    tt.rdli += c.budgetRdli || 0;
    tt.est += c.estimeBudget || 0;
    tt.eng += c.budgetEngage || 0;
    tt.real += c.consommeBudget || 0;
    const prof = c.chargeByProfile || [];
    if (prof.length) { prof.forEach(p => { tt.jh += p.jh || 0; tt.done += p.done || 0; const b = tt.byProf[p.profil] || (tt.byProf[p.profil] = { jh: 0, done: 0 }); b.jh += p.jh || 0; b.done += p.done || 0; }); }
    else { tt.jh += c.estime || 0; tt.done += c.consomme || 0; }
    tt.n++;
  });
  // Per-lane (canal) totals of the VISIBLE subjects — full breakdown, mirrors columns.
  const laneTotals = {};
  SWIMLANES.forEach(l => { laneTotals[l.id] = { rdli: 0, est: 0, eng: 0, real: 0, jh: 0, done: 0, n: 0, byProf: {} }; });
  cards.forEach(c => {
    if (c.dimmed || c.archived || c.hidden) return;
    const lt = laneTotals[c.canal]; if (!lt) return;
    lt.rdli += c.budgetRdli || 0;
    lt.est += c.estimeBudget || 0;
    lt.eng += c.budgetEngage || 0;
    lt.real += c.consommeBudget || 0;
    const prof = c.chargeByProfile || [];
    if (prof.length) prof.forEach(p => { lt.jh += p.jh || 0; lt.done += p.done || 0; const b = lt.byProf[p.profil] || (lt.byProf[p.profil] = { jh: 0, done: 0 }); b.jh += p.jh || 0; b.done += p.done || 0; });
    else { lt.jh += c.estime || 0; lt.done += c.consomme || 0; }
    lt.n++;
  });
  const colWeights = COLUMNS.map(c =>
    collapsedCols.has(c.id) ? '30px'
      : c.id === focusedColumn ? '2.6fr'
      : focusedColumn ? '0.62fr'
      : '1fr'
  );
  const [totalsOpen, setTotalsOpen] = useStateGrid(() => { try { return localStorage.getItem('nmo_totals_open') !== '0'; } catch (e) { return true; } });
  const toggleTotals = () => setTotalsOpen(v => { const n = !v; try { localStorage.setItem('nmo_totals_open', n ? '1' : '0'); } catch (e) {} return n; });
  const [laneTotalsOpen, setLaneTotalsOpen] = useStateGrid(() => { try { return localStorage.getItem('nmo_lane_totals_open') === '1'; } catch (e) { return false; } });
  const toggleLaneTotals = () => setLaneTotalsOpen(v => { const n = !v; try { localStorage.setItem('nmo_lane_totals_open', n ? '1' : '0'); } catch (e) {} return n; });
  const gridTemplateColumns = `${laneTotalsOpen ? '176px' : 'var(--lane-w)'} ${colWeights.join(' ')}`;
  const gridTemplateRows = ['auto', ...SWIMLANES.map(l => collapsed.has(l.id) ? '26px' : '1fr')].join(' ');

  return (
    <div className="board" style={{ gridTemplateColumns, gridTemplateRows }}>
      <div className="corner">
        <button className="totals-toggle" onClick={toggleTotals} title={totalsOpen ? 'Replier les totaux colonnes' : 'Déplier les totaux colonnes'}>{totalsOpen ? '▾' : '▸'} Σ</button>
        <button className="totals-toggle" onClick={toggleLaneTotals} title={laneTotalsOpen ? 'Replier les totaux lignes' : 'Déplier les totaux lignes'}>{laneTotalsOpen ? '▾' : '▸'} Σ</button>
      </div>
      {COLUMNS.map(col => (
        <ColumnHeader key={col.id} col={col} focused={focusedColumn === col.id} colCollapsed={collapsedCols.has(col.id)} totals={colTotals[col.id]} totalsOpen={totalsOpen} onFocus={onFocusColumn} onToggleCollapse={onToggleColumnCollapse} />
      ))}
      {SWIMLANES.map(lane => {
        const isCollapsed = collapsed.has(lane.id);
        return (
          <React.Fragment key={lane.id}>
            <LaneLabel lane={lane} collapsed={isCollapsed} disabled={!isCollapsed && collapsed.size >= SWIMLANES.length - 1} totals={laneTotals[lane.id]} totalsOpen={laneTotalsOpen} onToggle={() => onToggleLane(lane.id)} />
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
