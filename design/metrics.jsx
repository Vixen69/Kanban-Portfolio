// metrics.jsx
// Flow-metrics view (Sprint 6, pulled forward). Derived entirely from the live
// cards + their movement history — no charts library, just honest bars.
// Answers the governance questions: where does work pile up, where does it
// stagnate, what is blocked, and how much load is committed vs consumed.

// Compute every metric in one pass over the portfolio.
function computeFlowMetrics(cards) {
  const order = COLUMNS.map(c => c.id);
  const perCol = {};
  COLUMNS.forEach(c => { perCol[c.id] = { id: c.id, label: c.label, wip: c.wip, count: 0, blocked: 0, fresh: 0, recent: 0, aging: 0, stale: 0, ageSum: 0 }; });

  cards.forEach(c => {
    const col = perCol[c.column];
    if (!col) return;
    col.count++;
    if (c.blocked) col.blocked++;
    const d = daysInColumn(c);
    col.ageSum += d;
    const cat = ageCategory(d);
    col[cat]++;
  });

  // Average time SPENT in each stage, from completed transitions in history.
  const dur = {};
  order.forEach(id => { dur[id] = []; });
  cards.forEach(c => {
    const h = c.history || [];
    for (let k = 0; k < h.length - 1; k++) {
      const stage = h[k].to;
      if (!(stage in dur)) continue;
      const days = (new Date(h[k + 1].at) - new Date(h[k].at)) / 86400000;
      if (days >= 0 && days < 1000) dur[stage].push(days);
    }
  });
  const avgStage = {};
  order.forEach(id => { avgStage[id] = dur[id].length ? Math.round(dur[id].reduce((a, b) => a + b, 0) / dur[id].length) : 0; });

  // Charge by canal (estimé vs consommé, jours-homme).
  const canal = {};
  SWIMLANES.forEach(l => { canal[l.id] = { id: l.id, label: l.label, est: 0, cons: 0, count: 0 }; });
  cards.forEach(c => { const k = canal[c.canal]; if (!k) return; k.est += c.estime || 0; k.cons += c.consomme || 0; k.count++; });

  const done = cards.filter(c => c.column === 'done').length;
  const expl = cards.filter(c => c.column === 'exploitation').length;
  const blocked = cards.filter(c => c.blocked).length;
  const stale = cards.filter(c => daysInColumn(c) > 60).length;

  // Bottleneck = active/study stage with the most accumulated waiting.
  const bottleneck = order
    .filter(id => !['done', 'exploitation'].includes(id))
    .map(id => ({ id, score: avgStage[id] * Math.max(1, perCol[id].count) }))
    .sort((a, b) => b.score - a.score)[0];

  return { perCol, avgStage, canal, order, totals: { total: cards.length, done, expl, blocked, stale }, bottleneck: bottleneck ? bottleneck.id : null };
}

// A labelled horizontal bar.
function Bar({ label, value, max, sub, color, danger }) {
  const w = max ? Math.round(value / max * 100) : 0;
  return (
    <div className="mb-row">
      <span className="mb-label">{label}</span>
      <span className="mb-track"><span className="mb-fill" style={{ width: w + '%', background: danger ? 'var(--danger)' : (color || 'var(--accent)') }} /></span>
      <span className="mb-val">{sub != null ? sub : value}</span>
    </div>
  );
}

// Stacked age composition bar (fresh / recent / aging / stale).
function AgeStack({ col, max }) {
  const seg = [['fresh', '#86b9c9'], ['recent', '#c2cbd8'], ['aging', '#e6b15e'], ['stale', '#d56a6a']];
  return (
    <div className="mb-row">
      <span className="mb-label">{col.label}</span>
      <span className="mb-track stack">
        {seg.map(([k, c]) => col[k] > 0 && <span key={k} className="seg" style={{ width: (col[k] / (max || 1) * 100) + '%', background: c }} title={`${k}: ${col[k]}`} />)}
      </span>
      <span className="mb-val">{col.count}</span>
    </div>
  );
}

function MetricsView({ cards, onClose }) {
  const m = computeFlowMetrics(cards);
  const maxCount = Math.max(1, ...Object.values(m.perCol).map(c => c.count));
  const maxAvg = Math.max(1, ...m.order.map(id => m.avgStage[id]));
  const maxCharge = Math.max(1, ...Object.values(m.canal).map(c => c.est));

  return (
    <div className="metrics-view">
      <div className="metrics-head">
        <div>
          <h2 className="metrics-title">Métriques de flux</h2>
          <span className="metrics-sub">Dérivé du portefeuille en temps réel · {m.totals.total} sujets</span>
        </div>
        <button className="btn ghost" onClick={onClose}>Fermer ✕</button>
      </div>

      <div className="metrics-kpis">
        <div className="kpi"><span className="kpi-num">{m.totals.total}</span><span className="kpi-lab">Sujets</span></div>
        <div className="kpi"><span className="kpi-num">{m.totals.done + m.totals.expl}</span><span className="kpi-lab">Livrés / en prod</span></div>
        <div className="kpi alert"><span className="kpi-num">{m.totals.blocked}</span><span className="kpi-lab">Bloqués</span></div>
        <div className="kpi warn"><span className="kpi-num">{m.totals.stale}</span><span className="kpi-lab">Stagnants &gt; 60j</span></div>
        <div className="kpi accent"><span className="kpi-num">{m.bottleneck ? COLUMN_BY_ID[m.bottleneck].label : '—'}</span><span className="kpi-lab">Goulot principal</span></div>
      </div>

      <div className="metrics-grid">
        <div className="metric-panel">
          <div className="mp-title">Flux par étape <span className="mp-hint">nombre de sujets · limite d’encours</span></div>
          {m.order.map(id => {
            const c = m.perCol[id];
            const over = c.wip && c.count > c.wip;
            return <Bar key={id} label={c.label} value={c.count} max={maxCount} sub={c.wip ? `${c.count}/${c.wip}` : c.count} danger={over} />;
          })}
        </div>

        <div className="metric-panel">
          <div className="mp-title">Temps moyen passé par étape <span className="mp-hint">jours · où ça stagne</span></div>
          {m.order.map(id => (
            <Bar key={id} label={m.perCol[id].label} value={m.avgStage[id]} max={maxAvg} sub={m.avgStage[id] + 'j'} color={id === m.bottleneck ? 'var(--warn)' : 'var(--accent)'} danger={false} />
          ))}
        </div>

        <div className="metric-panel">
          <div className="mp-title">Composition d’âge par étape <span className="mp-hint"><i className="lg-sw" style={{ background: '#86b9c9' }} />frais <i className="lg-sw" style={{ background: '#c2cbd8' }} />récent <i className="lg-sw" style={{ background: '#e6b15e' }} />vieillit <i className="lg-sw" style={{ background: '#d56a6a' }} />stagnant</span></div>
          {m.order.map(id => <AgeStack key={id} col={m.perCol[id]} max={maxCount} />)}
        </div>

        <div className="metric-panel">
          <div className="mp-title">Blocages par étape <span className="mp-hint">{m.totals.blocked} au total</span></div>
          {m.order.filter(id => m.perCol[id].blocked > 0).map(id => (
            <Bar key={id} label={m.perCol[id].label} value={m.perCol[id].blocked} max={Math.max(1, ...m.order.map(x => m.perCol[x].blocked))} danger />
          ))}
          {m.totals.blocked === 0 && <div className="mp-empty">Aucun blocage. Tableau sain.</div>}
        </div>

        <div className="metric-panel wide">
          <div className="mp-title">Charge par canal <span className="mp-hint">jours-homme · consommé / estimé</span></div>
          {SWIMLANES.map(l => {
            const c = m.canal[l.id];
            const pct = c.est ? Math.round(c.cons / c.est * 100) : 0;
            return (
              <div className="charge-canal" key={l.id}>
                <span className="cc-label">{c.label} <i>({c.count})</i></span>
                <span className="cc-track">
                  <span className="cc-est" style={{ width: (c.est / maxCharge * 100) + '%' }}>
                    <span className="cc-cons" style={{ width: Math.min(100, pct) + '%', background: pct > 100 ? 'var(--danger)' : 'var(--accent)' }} />
                  </span>
                </span>
                <span className="cc-val">{c.cons} / {c.est} j.h</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { MetricsView, computeFlowMetrics });
