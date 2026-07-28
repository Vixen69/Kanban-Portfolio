// metrics.jsx
// Portfolio "Metrics" panel — a governance read-out aggregated from the live
// cards. Rebuilt for relevance: only the views a DSI portfolio committee
// actually acts on — money (budget croisé), capacity (RAF by role + contention),
// flow (throughput + lead/cycle), and health (blocages, risks, WIP).
// Everything is derived honestly from the data; no charts library.

const DONE_STAGES = ['done', 'exploitation'];

function computeMetrics(cards, wipLimits) {
  const active = cards.filter(c => !c.archived);
  const inFlow = active.filter(c => !DONE_STAGES.includes(c.column));

  // --- Budget croisé agrégé (k€) ---
  const budget = { rdli: 0, est: 0, eng: 0, real: 0 };
  // --- Capacity by role: remaining j.h (RAF) + consumed, and contention flags ---
  const roleAgg = {}; // profil -> { jh, done, contention }
  const addRole = (id) => roleAgg[id] || (roleAgg[id] = { jh: 0, done: 0, contention: 0 });
  let rafTotal = 0, jhTotal = 0, doneTotal = 0;

  active.forEach(c => {
    budget.rdli += c.budgetRdli || 0;
    budget.est += c.estimeBudget || 0;
    budget.eng += c.budgetEngage || 0;
    budget.real += c.consommeBudget || 0;
    const prof = c.chargeByProfile || [];
    if (prof.length) prof.forEach(p => { const r = addRole(p.profil); r.jh += p.jh || 0; r.done += p.done || 0; jhTotal += p.jh || 0; doneTotal += p.done || 0; });
    else { jhTotal += c.estime || 0; doneTotal += c.consomme || 0; }
    (c.contentionProfiles || []).forEach(id => { addRole(id).contention++; });
  });
  rafTotal = Math.max(0, jhTotal - doneTotal);

  const roles = Object.entries(roleAgg)
    .map(([id, v]) => ({ id, fam: (window.PROFILE_BY_ID || {})[id] || { label: id, color: '#64748b' }, raf: Math.max(0, v.jh - v.done), jh: v.jh, done: v.done, contention: v.contention }))
    .filter(r => r.jh > 0 || r.contention > 0)
    .sort((a, b) => (b.contention - a.contention) || (b.raf - a.raf));

  // --- Contention agrégée : profils signalés « en tension » à travers le portefeuille ---
  const contention = roles.filter(r => r.contention > 0).sort((a, b) => b.contention - a.contention);

  // --- Flux : throughput + lead/cycle moyens (sur les sujets terminés) ---
  const ft = window.flowTimes;
  const finished = active.filter(c => DONE_STAGES.includes(c.column));
  const leadArr = [], cycleArr = [];
  finished.forEach(c => { const f = ft(c); if (f.leadTime != null) leadArr.push(f.leadTime); if (f.cycleTime != null) cycleArr.push(f.cycleTime); });
  const avg = (a) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
  // Throughput: livraisons entrées en Done/Exploitation sur 30/90 derniers jours.
  const now = Date.now();
  const entered = (c) => { const h = (c.history || []).filter(x => DONE_STAGES.includes(x.to)); return h.length ? new Date(h[h.length - 1].at).getTime() : null; };
  let tp30 = 0, tp90 = 0;
  finished.forEach(c => { const e = entered(c); if (e == null) return; const d = (now - e) / 86400000; if (d <= 30) tp30++; if (d <= 90) tp90++; });

  // --- Blocages ---
  const blocked = active.filter(c => window.cardBlocked(c));
  const blockList = blocked.map(c => ({ id: c.id, name: c.name, reason: window.cardBlockReason(c), col: (window.COLUMN_BY_ID[c.column] || {}).label, days: daysInColumn(c) }))
    .sort((a, b) => b.days - a.days);

  // --- Risques agrégés par type (entité porteuse) ---
  const riskAgg = {};
  (window.RISK_TYPES || []).forEach(rt => { riskAgg[rt.id] = 0; });
  active.forEach(c => (c.risks || []).forEach(r => { if (r.type in riskAgg) riskAgg[r.type]++; }));
  const risks = (window.RISK_TYPES || []).map(rt => ({ ...rt, n: riskAgg[rt.id] })).filter(r => r.n > 0).sort((a, b) => b.n - a.n);

  // --- Contraintes du projet (Légale / Groupe / aucune) ---
  const constraint = { legale: 0, groupe: 0, aucune: 0 };
  active.forEach(c => { const cs = c.projConstraints || []; if (!cs.length) constraint.aucune++; else cs.forEach(x => { if (x in constraint) constraint[x]++; }); });

  // --- WIP par colonne : effectif en cours vs somme des limites d'encours ---
  const wip = COLUMNS.map(col => {
    const count = inFlow.filter(c => c.column === col.id).length;
    let limit = 0;
    SWIMLANES.forEach(l => { const k = l.id + ':' + col.id; limit += (wipLimits && wipLimits[k] != null) ? wipLimits[k] : (col.wip || 0); });
    return { id: col.id, label: col.label, count: inFlow.filter(c => c.column === col.id).length, limit, over: limit > 0 && count > limit };
  });

  return {
    nActive: active.length, nInFlow: inFlow.length, nBlocked: blocked.length,
    nFinished: finished.length,
    budget, roles, contention, rafTotal, jhTotal, doneTotal,
    lead: avg(leadArr), cycle: avg(cycleArr), tp30, tp90,
    blockList, risks, constraint, wip,
    engagePct: budget.rdli ? Math.round(budget.eng / budget.rdli * 100) : 0,
    realPct: budget.rdli ? Math.round(budget.real / budget.rdli * 100) : 0,
  };
}

function fmtK(n) { return Math.round(n || 0).toLocaleString('fr-FR'); }

function KPI({ num, unit, lab, tone }) {
  return (
    <div className={'mkpi' + (tone ? ' ' + tone : '')}>
      <span className="mkpi-num">{num}{unit && <i>{unit}</i>}</span>
      <span className="mkpi-lab">{lab}</span>
    </div>
  );
}

function Panel({ title, hint, wide, children }) {
  return (
    <div className={'m2-panel' + (wide ? ' wide' : '')}>
      <div className="m2-title">{title}{hint && <span className="m2-hint">{hint}</span>}</div>
      {children}
    </div>
  );
}

function MetricsView({ cards, wipLimits, onClose }) {
  const m = computeMetrics(cards, wipLimits);
  const bMax = Math.max(m.budget.rdli, m.budget.est, m.budget.eng, m.budget.real, 1) * 1.02;
  const budgetRows = [
    { key: 'rdli', label: 'Enveloppe RDLI', val: m.budget.rdli, color: '#94a3b8', ref: true },
    { key: 'est', label: 'Meilleur estimé', val: m.budget.est, color: 'var(--accent)' },
    { key: 'eng', label: 'Engagé', val: m.budget.eng, color: '#b45309' },
    { key: 'real', label: 'Réalisé', val: m.budget.real, color: m.budget.real > m.budget.rdli ? 'var(--danger)' : 'var(--ok)' },
  ];
  const roleMax = Math.max(1, ...m.roles.map(r => r.jh));
  const contMax = Math.max(1, ...m.contention.map(r => r.contention));
  const riskMax = Math.max(1, ...m.risks.map(r => r.n));
  const wipMax = Math.max(1, ...m.wip.map(w => Math.max(w.count, w.limit)));

  return (
    <div className="metrics-view m2">
      <div className="metrics-head">
        <div>
          <h2 className="metrics-title">Metrics</h2>
          <span className="metrics-sub">Portefeuille en temps réel · {m.nActive} sujets actifs · {m.nInFlow} en cours</span>
        </div>
        <button className="btn ghost" onClick={onClose}>Fermer ✕</button>
      </div>

      {/* KPI header */}
      <div className="m2-kpis">
        <KPI num={m.nInFlow} lab="Sujets en cours" />
        <KPI num={m.nBlocked} lab="Bloqués" tone={m.nBlocked ? 'alert' : ''} />
        <KPI num={m.engagePct} unit="%" lab="Capacité engagée / RDLI" tone={m.engagePct > 100 ? 'alert' : m.engagePct > 90 ? 'warn' : ''} />
        <KPI num={fmtK(m.rafTotal)} unit="j.h" lab="Reste à faire (charge)" tone="accent" />
        <KPI num={m.realPct} unit="%" lab="Réalisé / RDLI" tone={m.realPct > 100 ? 'alert' : ''} />
        <KPI num={m.tp30} lab="Livrés (30 j)" tone="ok" />
      </div>

      <div className="m2-grid">
        {/* Budget croisé agrégé */}
        <Panel title="Budget croisé — portefeuille" hint="k€ · trait = enveloppe RDLI">
          <div className="bgraph">
            {budgetRows.map(r => (
              <div className="bg-row" key={r.key}>
                <span className="bg-label">{r.label}</span>
                <div className="bg-track">
                  <span className="bg-fill" style={{ width: (r.val / bMax * 100) + '%', background: r.color, opacity: r.ref ? 0.5 : 1 }} />
                  <span className="bg-ref" style={{ left: (m.budget.rdli / bMax * 100) + '%' }} />
                </div>
                <span className="bg-val" style={{ color: r.key === 'real' && m.budget.real > m.budget.rdli ? 'var(--danger-strong)' : 'var(--tx-2)' }}>{fmtK(r.val)}</span>
              </div>
            ))}
          </div>
          {m.budget.real > m.budget.rdli
            ? <div className="m2-flag danger">Réalisé au-delà de l’enveloppe RDLI (+{fmtK(m.budget.real - m.budget.rdli)} k€)</div>
            : m.budget.eng > m.budget.rdli
            ? <div className="m2-flag warn">Engagé au-delà de l’enveloppe RDLI (+{fmtK(m.budget.eng - m.budget.rdli)} k€)</div>
            : <div className="m2-flag ok">Engagements dans l’enveloppe.</div>}
        </Panel>

        {/* Risque de contention agrégé */}
        <Panel title="Risque de contention" hint="profils signalés en tension">
          {m.contention.length === 0 ? <div className="mp-empty">Aucun profil signalé en tension.</div> : m.contention.map(r => (
            <div className="mb-row" key={r.id}>
              <span className="mb-label"><i className="lg-sw" style={{ background: r.fam.color }} />{r.fam.label}</span>
              <span className="mb-track"><span className="mb-fill" style={{ width: (r.contention / contMax * 100) + '%', background: r.fam.color }} /></span>
              <span className="mb-val">{r.contention} sujet{r.contention > 1 ? 's' : ''}</span>
            </div>
          ))}
        </Panel>

        {/* Capacité par rôle (RAF) */}
        <Panel title="Charge restante par rôle" hint="j.h RAF · ● = en tension" wide>
          {m.roles.length === 0 ? <div className="mp-empty">Aucune charge répartie.</div> : m.roles.map(r => (
            <div className="mb-row" key={r.id}>
              <span className="mb-label">{r.contention > 0 && <span className="cont-flag" title={r.contention + ' sujet(s) en tension'} />}<i className="lg-sw" style={{ background: r.fam.color }} />{r.fam.label}</span>
              <span className="mb-track">
                <span className="mb-fill soft" style={{ width: (r.jh / roleMax * 100) + '%', background: `color-mix(in oklab, ${r.fam.color} 22%, #fff)` }} />
                <span className="mb-fill over" style={{ width: (r.done / roleMax * 100) + '%', background: r.fam.color }} />
              </span>
              <span className="mb-val"><b>{fmtK(r.raf)}</b> / {fmtK(r.jh)}</span>
            </div>
          ))}
          <div className="m2-legend"><span><i className="lg-sw" style={{ background: '#64748b' }} />consommé</span><span><i className="lg-sw" style={{ background: '#cbd5e1' }} />charge totale</span></div>
        </Panel>

        {/* Flux : throughput + lead/cycle */}
        <Panel title="Flux" hint="débit & délais moyens">
          <div className="m2-flowrow">
            <div className="m2-stat"><span className="m2-stat-num">{m.tp30}</span><span className="m2-stat-lab">livrés 30 j</span></div>
            <div className="m2-stat"><span className="m2-stat-num">{m.tp90}</span><span className="m2-stat-lab">livrés 90 j</span></div>
            <div className="m2-stat"><span className="m2-stat-num">{m.lead != null ? m.lead : '—'}<i>j</i></span><span className="m2-stat-lab">lead time moy.</span></div>
            <div className="m2-stat"><span className="m2-stat-num">{m.cycle != null ? m.cycle : '—'}<i>j</i></span><span className="m2-stat-lab">cycle time moy.</span></div>
          </div>
          <div className="m2-note">Lead = Demandes → livraison · Cycle = Actifs → livraison · {m.nFinished} sujets livrés au total.</div>
        </Panel>

        {/* WIP vs limites */}
        <Panel title="Encours vs limites" hint="par colonne">
          {m.wip.map(w => (
            <div className="mb-row" key={w.id}>
              <span className="mb-label">{w.label}</span>
              <span className="mb-track"><span className="mb-fill" style={{ width: (w.count / wipMax * 100) + '%', background: w.over ? 'var(--danger)' : 'var(--accent)' }} /><span className="m2-wip-lim" style={{ left: (w.limit / wipMax * 100) + '%' }} /></span>
              <span className="mb-val" style={{ color: w.over ? 'var(--danger-strong)' : 'var(--tx-2)' }}>{w.count}/{w.limit}</span>
            </div>
          ))}
          <div className="m2-legend"><span>trait = limite d’encours cumulée</span></div>
        </Panel>

        {/* Risques par entité porteuse */}
        <Panel title="Risques par entité" hint="sujets porteurs d’un risque">
          {m.risks.length === 0 ? <div className="mp-empty">Aucun risque retenu.</div> : m.risks.map(r => (
            <div className="mb-row" key={r.id}>
              <span className="mb-label"><i className="lg-sw" style={{ background: r.color }} />{r.label}</span>
              <span className="mb-track"><span className="mb-fill" style={{ width: (r.n / riskMax * 100) + '%', background: r.color }} /></span>
              <span className="mb-val">{r.n}</span>
            </div>
          ))}
          <div className="m2-constraints">
            <span className="cn-chip legale">Légale · {m.constraint.legale}</span>
            <span className="cn-chip groupe">Groupe · {m.constraint.groupe}</span>
            <span className="cn-chip aucune">Aucune · {m.constraint.aucune}</span>
          </div>
        </Panel>

        {/* Top blocages */}
        <Panel title="Blocages" hint={m.nBlocked + ' sujet(s) bloqué(s)'} wide>
          {m.blockList.length === 0 ? <div className="mp-empty">Aucun blocage. Tableau sain.</div> : (
            <div className="blk-list">
              {m.blockList.slice(0, 8).map(b => (
                <div className="blk-item" key={b.id}>
                  <span className="blk-pulse" />
                  <span className="blk-name">{b.name}</span>
                  <span className="blk-reason">{b.reason || 'motif non précisé'}</span>
                  <span className="blk-meta">{b.col} · {b.days} j</span>
                </div>
              ))}
              {m.blockList.length > 8 && <div className="m2-note">+ {m.blockList.length - 8} autre(s) sujet(s) bloqué(s).</div>}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

Object.assign(window, { MetricsView, computeMetrics });
