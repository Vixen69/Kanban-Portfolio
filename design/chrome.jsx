// chrome.jsx
// Static frame around the board: Header, Footer, Sidebar (search + filters + stats).
// Sprint 2 makes the sidebar analytical: filters dim (never remove) AND drive a
// live read-out of what's on screen — the question a Portfolio Sync actually asks.

// --- Header: identity left, portfolio pulse + legend + actions right. ---
function Header({ stats, view, filtersActive, onResetFilters, onAdd, onAdmin, onMetrics, onToggleSidebar, focusLabel, onClearFocus }) {
  return (
    <header className="header">
      <div className="hd-left">
        <button className="icon-btn" onClick={onToggleSidebar} title="Filtres (S)">{'≡'}</button>
        <span className="hd-title">Portefeuille DSI</span>
        <span className="hd-ghost">NMO · Portfolio Sync</span>
        {filtersActive && (
          <button className="filter-chip" onClick={onResetFilters} title="Réinitialiser les filtres (Esc)">
            Filtré : {view.shown}/{stats.total} {'✕'}
          </button>
        )}
        {focusLabel && (
          <button className="focus-chip" onClick={onClearFocus} title="Quitter le focus (Esc)">
            Focus : {focusLabel} {'✕'}
          </button>
        )}
      </div>
      <div className="hd-right">
        <div className="hd-stat"><b>{stats.total}</b> sujets</div>
        <div className={'hd-stat' + (stats.blocked ? ' alert' : '')}>
          <span className="blk-dot-static" /> <b>{stats.blocked}</b> bloqués
        </div>
        <div className="hd-legend">
          {DOMAINS.map(d => (
            <span className="lg" key={d.id} title={d.label}>
              <span className="lg-dot" style={{ background: d.color }} />{d.short}
            </span>
          ))}
        </div>
        <button className="icon-btn" onClick={onMetrics} title="Métriques de flux">{'☷'}</button>
        <button className="icon-btn" onClick={onAdmin} title="Configuration du tableau">{'⚙'}</button>
        <button className="add-btn" onClick={onAdd} title="Nouveau sujet (N)">+ Sujet</button>
      </div>
    </header>
  );
}

// --- Filter pill ---
function Pill({ active, onClick, color, children }) {
  return (
    <button className={'pill' + (active ? ' on' : '')} onClick={onClick}>
      {color && <span className="pill-dot" style={{ background: color }} />}
      {children}
    </button>
  );
}

// --- Category header: label + tout/rien quick toggles (matters most for 9 RDOM). ---
function CatHead({ label, allOn, noneOn, onAll, onNone }) {
  return (
    <div className="cat-head">
      <span className="sb-label">{label}</span>
      <div className="cat-actions">
        <button className="mini-act" disabled={allOn} onClick={onAll}>tout</button>
        <span className="cat-sep">·</span>
        <button className="mini-act" disabled={noneOn} onClick={onNone}>rien</button>
      </div>
    </div>
  );
}

// One stat row. When filtering, the visible count leads; total trails as muted ref.
function StatRow({ label, value, total, alert, active }) {
  return (
    <div className={'stat-row' + (alert ? ' alert' : '')}>
      <span>{label}</span>
      <b>{value}{active && <i className="ref"> / {total}</i>}</b>
    </div>
  );
}

// --- Sidebar: hidden by default, toggled. Filters dim, never remove (spatial truth, P3). ---
function Sidebar({ open, search, setSearch, filters, toggle, setGroup, stats, view, filtersActive, onReset, searchRef, showCodes, setShowCodes }) {
  const allOn = (g) => Object.values(filters[g]).every(Boolean);
  const noneOn = (g) => Object.values(filters[g]).every(v => !v);

  return (
    <aside className={'sidebar' + (open ? ' open' : '')}>
      <div className="sb-section sb-search-wrap">
        <input
          ref={searchRef}
          className="search"
          placeholder="Rechercher un sujet…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && <button className="search-x" onClick={() => setSearch('')} title="Effacer">{'✕'}</button>}
      </div>

      {/* Live read-out: what is on screen right now, and a one-click way back. */}
      <div className="sb-result">
        <span className="sb-result-count"><b>{view.shown}</b> / {stats.total} affichés</span>
        {filtersActive && <button className="reset-btn" onClick={onReset}>Réinitialiser</button>}
      </div>

      <div className="sb-section">
        <label className="code-toggle">
          <span className="sb-label" style={{ marginBottom: 0 }}>Codes projet</span>
          <span className={'switch' + (showCodes ? ' on' : '')} onClick={() => setShowCodes(v => !v)}><span className="knob" /></span>
        </label>
        <div className="code-hint">{showCodes ? 'Affichés sur les cartes (ex. PX4520155)' : 'Masqués — recherchables dans la barre ci-dessus'}</div>
      </div>

      <div className="sb-section">
        <CatHead label="Type de projet" allOn={allOn('type')} noneOn={noneOn('type')} onAll={() => setGroup('type', true)} onNone={() => setGroup('type', false)} />
        <div className="pill-row wrap">
          {TYPES.map(tp => (
            <Pill key={tp.id} active={filters.type[tp.id]} onClick={() => toggle('type', tp.id)} color={tp.color}>{tp.label}</Pill>
          ))}
        </div>
      </div>

      <div className="sb-section">
        <CatHead label="Nature" allOn={allOn('nature')} noneOn={noneOn('nature')} onAll={() => setGroup('nature', true)} onNone={() => setGroup('nature', false)} />
        <div className="pill-row">
          {Object.entries(NATURE).map(([k, n]) => (
            <Pill key={k} active={filters.nature[k]} onClick={() => toggle('nature', k)} color={n.fg}>{n.label}</Pill>
          ))}
        </div>
      </div>

      <div className="sb-section">
        <CatHead label="Criticité" allOn={allOn('crit')} noneOn={noneOn('crit')} onAll={() => setGroup('crit', true)} onNone={() => setGroup('crit', false)} />
        <div className="pill-row">
          <Pill active={filters.crit.normal} onClick={() => toggle('crit', 'normal')}>{CRITICALITY.normal.label}</Pill>
          <Pill active={filters.crit.major} onClick={() => toggle('crit', 'major')} color="#94a3b8">{CRITICALITY.major.label}</Pill>
          <Pill active={filters.crit.top} onClick={() => toggle('crit', 'top')} color="#eab308">{'★'} {CRITICALITY.top.label}</Pill>
        </div>
      </div>

      <div className="sb-section">
        <CatHead label="Domaine RDOM" allOn={allOn('rdom')} noneOn={noneOn('rdom')} onAll={() => setGroup('rdom', true)} onNone={() => setGroup('rdom', false)} />
        <div className="pill-row wrap">
          {DOMAINS.map(d => (
            <Pill key={d.id} active={filters.rdom[d.id]} onClick={() => toggle('rdom', d.id)} color={d.color}>{d.short}</Pill>
          ))}
        </div>
      </div>

      <div className="sb-stats">
        <div className="sb-label">{filtersActive ? 'Sélection · total' : 'Vue d’ensemble'}</div>
        <StatRow label="Total" value={view.shown} total={stats.total} active={filtersActive} />
        <StatRow label="Bloqués" value={view.blocked} total={stats.blocked} alert active={filtersActive} />
        <StatRow label="Stagnants (> 60j)" value={view.stale} total={stats.stale} active={filtersActive} />
        <div className="stat-divider" />
        <StatRow label="★ Top" value={view.top} total={stats.top} active={filtersActive} />
        <StatRow label="Major" value={view.major} total={stats.major} active={filtersActive} />
        <StatRow label="Normal" value={view.normal} total={stats.normal} active={filtersActive} />
        <div className="stat-divider" />
        <StatRow label={NATURE.simple.label} value={view.simple} total={stats.simple} active={filtersActive} />
        <StatRow label={NATURE.complicated.label} value={view.complicated} total={stats.complicated} active={filtersActive} />
        <StatRow label={NATURE.complex.label} value={view.complex} total={stats.complex} active={filtersActive} />
      </div>

      <div className="sb-shortcuts">
        <span><kbd>/</kbd> rechercher</span>
        <span><kbd>N</kbd> nouveau</span>
        <span><kbd>S</kbd> panneau</span>
        <span><kbd>Esc</kbd> revenir</span>
      </div>
    </aside>
  );
}

Object.assign(window, { Header, Sidebar, Pill });
