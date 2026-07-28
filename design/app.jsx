// app.jsx
// Root: state, filtering, drag & drop, focus, collapse, persistence, keyboard, tweaks.

const { useState, useEffect, useRef, useMemo } = React;
const STORAGE_KEY = 'nmo_portfolio_v15';
const CONFIG_KEY = 'nmo_board_config_v2';
const WIP_KEY = 'nmo_wip_v1';

// Per-cell WIP limits (lane × column), keyed "laneId:colId".
// Defaults vary per cell — each canal gets its own capacity, not a shared column number.
function defaultWipLimits() {
  const m = {};
  const offsets = [-2, -1, 0, 1, 2, 1]; // spread so cells in a column differ by canal
  SWIMLANES.forEach((lane, li) => {
    COLUMNS.forEach(col => {
      const k = lane.id + ':' + col.id;
      if (col.wip == null) { m[k] = null; return; }
      m[k] = Math.max(2, col.wip + offsets[li % offsets.length]);
    });
  });
  return m;
}
function loadWipLimits() {
  try { const raw = localStorage.getItem(WIP_KEY); if (raw) return { ...defaultWipLimits(), ...JSON.parse(raw) }; } catch (e) {}
  return defaultWipLimits();
}

// Load saved board config (admin panel) and apply it BEFORE first render.
function loadBoardConfig() {
  try { const raw = localStorage.getItem(CONFIG_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
  return defaultBoardConfig();
}
const INITIAL_CFG = loadBoardConfig();
applyBoardConfig(INITIAL_CFG);

// Tweaks explore the visual DIRECTIONS for the radiator — not the model (P6).
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": 16,
  "agingStyle": "aucun",
  "blockedStyle": "pulse",
  "domainStyle": "bar",
  "bgTone": "neutre"
}/*EDITMODE-END*/;

// Background tone overrides (light only — WCAG-friendly neutrals).
const TONES = {
  neutre: {},
  chaud: { '--bg-page': '#e9e4db', '--bg-cell': '#f3efe8', '--bg-cell-2': '#ebe5da', '--bg-card': '#fffdf9', '--bd': '#d6ccbb', '--bd-sub': '#e4ddd0' },
  froid: { '--bg-page': '#dce6ef', '--bg-cell': '#edf2f8', '--bg-cell-2': '#e1eaf3', '--bg-card': '#ffffff', '--bd': '#bccbda', '--bd-sub': '#d3deea' },
};

function loadCards() {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
  return generateCards();
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [cards, setCards] = useState(loadCards);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(() => ({
    crit: { normal: true, major: true, top: true },
    constraint: { legale: true, groupe: true, aucune: true },
    rdom: Object.fromEntries(DOMAINS.map(d => [d.id, true])),
    type: Object.fromEntries(TYPES.map(t => [t.id, true])),
  }));
  const [showCodes, setShowCodes] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [focusCol, setFocusCol] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [collapsedCols, setCollapsedCols] = useState(() => new Set(['pause']));
  const [detail, setDetail] = useState(null);
  const [adding, setAdding] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [metrics, setMetrics] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [dropCardId, setDropCardId] = useState(null);
  const [cfg, setCfg] = useState(INITIAL_CFG);
  const [wipLimits, setWipLimits] = useState(loadWipLimits);
  const [dragOver, setDragOver] = useState(null);
  const dragId = useRef(null);
  const searchRef = useRef(null);

  // Prototype-grade persistence (Sprint 0). Sprint 3 swaps this for the API.
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cards)); } catch (e) {} }, [cards]);
  useEffect(() => { try { localStorage.setItem(WIP_KEY, JSON.stringify(wipLimits)); } catch (e) {} }, [wipLimits]);
  const onSetWip = (laneId, colId, val) => setWipLimits(m => ({ ...m, [laneId + ':' + colId]: val }));

  const toggle = (group, key) => setFilters(f => ({ ...f, [group]: { ...f[group], [key]: !f[group][key] } }));

  // Set every key in a category at once (the tout / rien quick toggles).
  const setGroup = (group, value) => setFilters(f => ({ ...f, [group]: Object.fromEntries(Object.keys(f[group]).map(k => [k, value])) }));

  // Back to the full portfolio: clear search and re-enable every filter.
  const resetFilters = () => {
    setSearch('');
    setBlockedOnly(false);
    setFilters({
      crit: { normal: true, major: true, top: true },
      constraint: { legale: true, groupe: true, aucune: true },
      rdom: Object.fromEntries(DOMAINS.map(d => [d.id, true])),
      type: Object.fromEntries(TYPES.map(t => [t.id, true])),
    });
  };

  // Dim (never remove) filtered/non-matching cards — spatial structure is always truth (P3).
  // Archived subjects leave the board entirely (kept only in the archive view).
  const q = search.trim().toLowerCase();
  const activeCards = useMemo(() => cards.filter(c => !c.archived), [cards]);
  const archivedCards = useMemo(() => cards.filter(c => c.archived), [cards]);
  const decorated = useMemo(() => activeCards.map(c => {
    const match = !q || c.name.toLowerCase().includes(q) || (c.codename || '').toLowerCase().includes(q);
    const cons = (c.projConstraints || []);
    const conPass = cons.length ? cons.some(x => filters.constraint[x]) : filters.constraint.aucune;
    const pass = filters.crit[c.criticality] && conPass && filters.rdom[c.rdom] && (filters.type[c.type] !== false) && (!blockedOnly || cardBlocked(c));
    return { ...c, dimmed: !(match && pass) };
  }), [activeCards, q, filters, blockedOnly]);

  // Is the board currently narrowed by search or any filter category?
  const allOn = (g) => Object.values(filters[g]).every(Boolean);
  const filtersActive = !!q || blockedOnly || !allOn('crit') || !allOn('constraint') || !allOn('rdom') || !allOn('type');

  const stats = useMemo(() => {
    const s = { total: activeCards.length, blocked: 0, stale: 0, top: 0, major: 0, normal: 0, simple: 0, complicated: 0, complex: 0 };
    activeCards.forEach(c => { if (cardBlocked(c)) s.blocked++; if (daysInColumn(c) > 60) s.stale++; s[c.criticality]++; s[c.nature]++; });
    return s;
  }, [activeCards]);

  // Live read-out of the VISIBLE subset (what the filters/search currently show).
  const view = useMemo(() => {
    const v = { shown: 0, total: activeCards.length, blocked: 0, stale: 0, top: 0, major: 0, normal: 0, simple: 0, complicated: 0, complex: 0 };
    decorated.forEach(c => {
      if (c.dimmed) return;
      v.shown++;
      if (cardBlocked(c)) v.blocked++;
      if (daysInColumn(c) > 60) v.stale++;
      v[c.criticality]++; v[c.nature]++;
    });
    return v;
  }, [decorated, activeCards.length]);

  // --- Drag & drop: moving a card IS the governance decision (P2). Records history. ---
  const onDragStart = (e, card) => { dragId.current = card.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', card.id); } catch (_) {} };
  const onDragEnd = () => { dragId.current = null; setDragOver(null); setDropCardId(null); };
  const onDragOverCell = (e, lane, col) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(d => (d && d.lane === lane.id && d.column === col.id) ? d : { lane: lane.id, column: col.id }); };
  const onDragLeaveCell = () => {};
  const onDrop = (e, lane, col) => {
    e.preventDefault();
    const id = dragId.current || e.dataTransfer.getData('text/plain');
    setDragOver(null);
    if (!id) return;
    setCards(cs => cs.map(c => {
      if (c.id !== id || (c.column === col.id && c.canal === lane.id)) return c;
      const now = new Date().toISOString();
      return { ...c, column: col.id, canal: lane.id, movedAt: now, history: [...c.history, { from: c.column, to: col.id, at: now, user: 'vous' }] };
    }));
  };

  // Reorder within (or across) a cell by dropping a card ONTO another card: inserts before it.
  const onCardOver = (e, target) => {
    const id = dragId.current;
    if (!id || id === target.id) return;
    e.preventDefault(); e.stopPropagation();
    setDropCardId(d => d === target.id ? d : target.id);
  };
  const onCardDrop = (e, target) => {
    e.preventDefault(); e.stopPropagation();
    const id = dragId.current || e.dataTransfer.getData('text/plain');
    setDropCardId(null); setDragOver(null);
    if (!id || id === target.id) return;
    setCards(cs => {
      const arr = cs.slice();
      const from = arr.findIndex(c => c.id === id);
      if (from < 0) return cs;
      const moved = { ...arr[from] };
      if (moved.column !== target.column || moved.canal !== target.canal) {
        const now = new Date().toISOString();
        moved.history = [...moved.history, { from: moved.column, to: target.column, at: now, user: 'vous' }];
        moved.column = target.column; moved.canal = target.canal; moved.movedAt = now;
      }
      arr.splice(from, 1);
      const ti = arr.findIndex(c => c.id === target.id);
      arr.splice(ti, 0, moved);
      return arr;
    });
  };

  const onSave = (d) => { setCards(cs => cs.map(c => c.id === d.id ? { ...d } : c)); setDetail(d); };
  const onDelete = (id) => { setCards(cs => cs.filter(c => c.id !== id)); setDetail(null); };
  const onArchive = (card) => { setCards(cs => cs.map(c => c.id === card.id ? { ...c, archived: true } : c)); setDetail(null); };
  const onUnarchive = (id) => setCards(cs => cs.map(c => c.id === id ? { ...c, archived: false } : c));
  const onCreate = (d) => {
    const now = new Date().toISOString();
    const card = {
      ...d, id: 'S' + Date.now(), column: 'demandes', blocked: false, blockReason: '',
      notes: '', sciformaId: null,
      codename: 'PX' + Math.floor(1000000 + Math.random() * 9000000),
      estime: d.estime || 0, consomme: 0, estimeBudget: d.estimeBudget || 0, consommeBudget: 0,
      planCharge: '', ressources: [], commentaires: [],
      movedAt: now, history: [{ from: null, to: 'demandes', at: now, user: 'vous' }],
    };
    setCards(cs => [card, ...cs]);
    setAdding(false);
  };

  const onFocusColumn = (id) => setFocusCol(c => c === id ? null : id);

  // Two-stage card click (P5): first click on a card in a non-focused column
  // expands that stage; a second click (now a focus card) opens the full detail.
  const onCardClick = (card) => setDetail(card);

  // Apply an admin config: push to globals, persist, and reconcile cards/filters
  // whose column/lane/domain may have been deleted.
  const onApplyConfig = (next) => {
    applyBoardConfig(next);
    setCfg(next);
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(next)); } catch (e) {}
    setCards(cs => cs.map(c => ({
      ...c,
      column: next.columns.some(x => x.id === c.column) ? c.column : next.columns[0].id,
      canal: next.lanes.some(x => x.id === c.canal) ? c.canal : next.lanes[0].id,
      rdom: next.domains.some(x => x.id === c.rdom) ? c.rdom : next.domains[0].id,
      type: (next.types || []).some(x => x.id === c.type) ? c.type : ((next.types && next.types[0]) ? next.types[0].id : c.type),
    })));
    setFilters(f => ({
      ...f,
      rdom: Object.fromEntries(next.domains.map(d => [d.id, f.rdom[d.id] !== false])),
      type: Object.fromEntries((next.types || TYPES).map(tp => [tp.id, !f.type || f.type[tp.id] !== false])),
    }));
    if (focusCol && !next.columns.some(x => x.id === focusCol)) setFocusCol(null);
    setAdmin(false);
  };
  const onToggleLane = (id) => setCollapsed(s => {
    const n = new Set(s);
    if (n.has(id)) { n.delete(id); return n; }
    // Toujours garder au moins une ligne dépliée : refuser de replier la dernière.
    if (n.size >= SWIMLANES.length - 1) return s;
    n.add(id);
    return n;
  });
  // Collapse a column to a narrow strip (e.g. Pause when not steering the flow).
  const onToggleColumnCollapse = (id) => {
    setCollapsedCols(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    if (focusCol === id) setFocusCol(null);
  };
  const regenerate = () => { try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} setCards(generateCards()); setDetail(null); };

  // --- Keyboard shortcuts: / search, N add, S sidebar, Esc unwinds context. ---
  useEffect(() => {
    const h = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (e.key === 'Escape') {
        if (detail) setDetail(null); else if (adding) setAdding(false); else if (archiveOpen) setArchiveOpen(false); else if (sidebar) setSidebar(false);
        else if (focusCol) setFocusCol(null); else if (collapsed.size) setCollapsed(new Set());
        return;
      }
      if (typing) return;
      if (e.key === '/') { e.preventDefault(); setSidebar(true); setTimeout(() => searchRef.current && searchRef.current.focus(), 60); }
      else if (e.key.toLowerCase() === 'n') { e.preventDefault(); setAdding(true); }
      else if (e.key.toLowerCase() === 's') { setSidebar(s => !s); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [detail, adding, sidebar, focusCol, collapsed]);

  // Sidebar width is driven inline from state so it never depends on CSS-class timing.
  const rootStyle = {
    '--card-h': t.density + 'px',
    gridTemplateColumns: sidebar ? '214px 1fr' : '0 1fr',
    ...(TONES[t.bgTone] || {}),
  };
  const focusLabel = focusCol ? COLUMN_BY_ID[focusCol].label : null;

  return (
    <div className={'app' + (sidebar ? ' sidebar-open' : '')} style={rootStyle}>
      <Header
        stats={stats}
        view={view}
        filtersActive={filtersActive}
        onResetFilters={resetFilters}
        onAdd={() => setAdding(true)}
        onAdmin={() => setAdmin(true)}
        onMetrics={() => setMetrics(true)}
        onArchive={() => setArchiveOpen(true)}
        archivedCount={archivedCards.length}
        onToggleSidebar={() => setSidebar(s => !s)}
        focusLabel={focusLabel}
        onClearFocus={() => setFocusCol(null)}
      />
      <Sidebar open={sidebar} search={search} setSearch={setSearch} filters={filters} toggle={toggle} setGroup={setGroup} blockedOnly={blockedOnly} setBlockedOnly={setBlockedOnly} stats={stats} view={view} filtersActive={filtersActive} onReset={resetFilters} searchRef={searchRef} showCodes={showCodes} setShowCodes={setShowCodes} />
      <div className="board-area">
        <BoardGrid
          cards={decorated}
          focusedColumn={focusCol}
          collapsed={collapsed}
          collapsedCols={collapsedCols}
          t={t}
          wipLimits={wipLimits}
          onSetWip={onSetWip}
          showCodes={showCodes}
          dragOver={dragOver}
          onFocusColumn={onFocusColumn}
          onToggleLane={onToggleLane}
          onToggleColumnCollapse={onToggleColumnCollapse}
          onOpen={onCardClick}
          onOpenDirect={setDetail}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDrop={onDrop}
          onDragOverCell={onDragOverCell}
          onDragLeaveCell={onDragLeaveCell}
          onCardOver={onCardOver}
          onCardDrop={onCardDrop}
          dropCardId={dropCardId}
        />
        {view.shown === 0 && (
          <div className="empty-overlay">
            <div className="empty-card">
              <div className="empty-title">Aucun sujet ne correspond</div>
              <div className="empty-sub">La structure du tableau reste visible — seules les cartes sont masquées.</div>
              <button className="btn primary" onClick={resetFilters}>Réinitialiser les filtres</button>
            </div>
          </div>
        )}
      </div>

      {detail && <CardDetail card={detail} allCards={cards} onClose={() => setDetail(null)} onSave={onSave} onDelete={onDelete} onArchive={onArchive} />}
      {adding && <QuickAdd onClose={() => setAdding(false)} onCreate={onCreate} />}
      {admin && <AdminPanel cfg={cfg} onApply={onApplyConfig} onClose={() => setAdmin(false)} />}
      {metrics && <MetricsView cards={cards} wipLimits={wipLimits} onClose={() => setMetrics(false)} />}
      {archiveOpen && <ArchiveView cards={archivedCards} onUnarchive={onUnarchive} onOpen={(c) => { setArchiveOpen(false); setDetail(c); }} onClose={() => setArchiveOpen(false)} />}

      <TweaksPanel>
        <TweakSection label="Densité du radiateur" />
        <TweakSlider label="Hauteur de carte" value={t.density} min={13} max={22} step={1} unit="px" onChange={(v) => setTweak('density', v)} />

        <TweakSection label="Lecture de l’âge" />
        <TweakRadio label="Stagnation" value={t.agingStyle} options={['aucun', 'fade', 'desaturate', 'edge']} onChange={(v) => setTweak('agingStyle', v)} />

        <TweakSection label="Signal de blocage" />
        <TweakRadio label="Bloqué" value={t.blockedStyle} options={['pulse', 'wash', 'stripe']} onChange={(v) => setTweak('blockedStyle', v)} />

        <TweakSection label="Couleur de domaine" />
        <TweakRadio label="RDOM" value={t.domainStyle} options={['bar', 'dot', 'tint']} onChange={(v) => setTweak('domainStyle', v)} />

        <TweakSection label="Ambiance" />
        <TweakRadio label="Fond" value={t.bgTone} options={['neutre', 'chaud', 'froid']} onChange={(v) => setTweak('bgTone', v)} />

        <TweakSection label="Données" />
        <TweakButton label="Régénérer le portefeuille" onClick={regenerate} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
