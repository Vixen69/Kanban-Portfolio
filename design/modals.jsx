// modals.jsx
// CardDetail (read + edit) and QuickAdd. Minimal, conversation-oriented (P5):
// just enough to point at a card and make a 2-minute decision at Portfolio Sync.

const { useState: useStateModal, useEffect: useEffectModal } = React;

function Tag({ color, children, solid }) {
  const style = solid
    ? { background: color, color: '#1a1505', borderColor: color }
    : { color: `color-mix(in oklab, ${color} 60%, #0f172a)`, borderColor: `color-mix(in oklab, ${color} 40%, transparent)`, background: `color-mix(in oklab, ${color} 10%, #fff)` };
  return <span className="dtag" style={style}>{children}</span>;
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

// --- Inline edit: click a value to edit it in place; Enter/blur commits, Esc cancels. ---
function InlineEdit({ value, onCommit, type = 'text', placeholder = '', display, toInput, fromInput, className = '' }) {
  const [editing, setEditing] = useStateModal(false);
  const [val, setVal] = useStateModal('');
  const start = (e) => { e.stopPropagation(); setVal(toInput ? toInput(value) : (value == null ? '' : value)); setEditing(true); };
  const commit = () => { setEditing(false); onCommit(fromInput ? fromInput(val) : val); };
  if (editing) {
    return (
      <input
        className={'inline-inp ' + className} type={type} autoFocus value={val} placeholder={placeholder}
        onClick={(e) => e.stopPropagation()} onChange={(e) => setVal(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); else if (e.key === 'Escape') setEditing(false); }}
      />
    );
  }
  return <span className={'inline-val ' + className} onClick={start} title="Cliquer pour modifier">{display != null ? display : (value || placeholder || '—')}</span>;
}

// --- Plan de charge editor: full profile typology, check + j/h per checked profile. ---
function ChargeEditor({ card, est, cons, onSave, onCancel }) {
  const init = {}; (card.chargeByProfile || []).forEach(p => { init[p.profil] = String(p.jh); });
  const [rows, setRows] = useStateModal(init);
  const toggle = (id) => setRows(r => { const n = { ...r }; if (id in n) delete n[id]; else n[id] = '0'; return n; });
  const setJh = (id, v) => setRows(r => ({ ...r, [id]: v }));
  const total = PROFILES.filter(p => p.id in rows).reduce((s, p) => s + (parseInt(rows[p.id], 10) || 0), 0);
  const save = () => onSave(PROFILES.filter(p => p.id in rows).map(p => {
    const jh = Math.max(0, parseInt(rows[p.id], 10) || 0);
    const done = est ? Math.round(jh * cons / est) : 0;
    return { profil: p.id, jh, done: Math.min(jh, done) };
  }));
  return (
    <div className="charge-editor">
      <div className="ce-list">
        {PROFILES.map(p => {
          const on = p.id in rows;
          return (
            <label className={'ce-row' + (on ? ' on' : '')} key={p.id}>
              <input type="checkbox" checked={on} onChange={() => toggle(p.id)} />
              <span className="ce-dot" style={{ background: p.color }} />
              <span className="ce-label">{p.label}</span>
              <input className="ce-num" type="number" min="0" disabled={!on} value={on ? rows[p.id] : ''} placeholder="0" onChange={(e) => setJh(p.id, e.target.value)} />
              <span className="ce-unit">j.h</span>
            </label>
          );
        })}
      </div>
      <div className="ce-foot">
        <span className="ce-total">Total <b>{total}</b> j.h</span>
        <div className="ce-actions">
          <button className="lift-btn" onClick={save}>Enregistrer</button>
          <button className="cont-cancel" onClick={onCancel}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

// --- Contention editor: checklist of profiles under tension. ---
function ContentionEditor({ card, onSave, onCancel }) {
  const [sel, setSel] = useStateModal(new Set(card.contentionProfiles || []));
  const [note, setNote] = useStateModal(card.contentionNote || '');
  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <div className="charge-editor">
      <div className="ce-list">
        {PROFILES.map(p => {
          const on = sel.has(p.id);
          return (
            <label className={'ce-row' + (on ? ' on' : '')} key={p.id}>
              <input type="checkbox" checked={on} onChange={() => toggle(p.id)} />
              <span className="ce-dot" style={{ background: p.color }} />
              <span className="ce-label">{p.label}</span>
            </label>
          );
        })}
      </div>
      <textarea className="cont-area" value={note} placeholder="Commentaire libre sur la contention (partage, disponibilité, conflits de planning…)" onChange={(e) => setNote(e.target.value)} />
      <div className="ce-foot">
        <span className="ce-total"><b>{sel.size}</b> profil(s) en tension</span>
        <div className="ce-actions">
          <button className="lift-btn" onClick={() => onSave({ profiles: [...sel], note: note.trim() })}>Enregistrer</button>
          <button className="cont-cancel" onClick={onCancel}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

// --- Risk editor: full risk typology (entité porteuse), check which are retained. ---
function RiskEditor({ card, onSave, onCancel }) {
  const init = {}; (card.risks || []).forEach(r => { init[r.type] = r.desc || ''; });
  const [sel, setSel] = useStateModal(init);
  const toggle = (id) => setSel(s => { const n = { ...s }; if (id in n) delete n[id]; else n[id] = ''; return n; });
  return (
    <div className="charge-editor">
      <div className="ce-list">
        {RISK_TYPES.map(rt => {
          const on = rt.id in sel;
          return (
            <label className={'ce-row' + (on ? ' on' : '')} key={rt.id}>
              <input type="checkbox" checked={on} onChange={() => toggle(rt.id)} />
              <span className="ce-dot" style={{ background: rt.color }} />
              <span className="ce-label">{rt.label}</span>
            </label>
          );
        })}
      </div>
      <div className="ce-foot">
        <span className="ce-total"><b>{Object.keys(sel).length}</b> risque(s) retenu(s)</span>
        <div className="ce-actions">
          <button className="lift-btn" onClick={() => onSave(RISK_TYPES.filter(rt => rt.id in sel).map(rt => ({ type: rt.id, desc: sel[rt.id] })))}>Enregistrer</button>
          <button className="cont-cancel" onClick={onCancel}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

// --- Project-constraint editor: checklist (Légale, Groupe…). ---
function ConstraintEditor({ card, onSave, onCancel }) {
  const [sel, setSel] = useStateModal(new Set(card.projConstraints || []));
  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <div className="charge-editor">
      <div className="ce-list">
        {PROJECT_CONSTRAINTS.map(pc => {
          const on = sel.has(pc.id);
          return (
            <label className={'ce-row' + (on ? ' on' : '')} key={pc.id}>
              <input type="checkbox" checked={on} onChange={() => toggle(pc.id)} />
              <span className="ce-dot" style={{ background: pc.color }} />
              <span className="ce-label">{pc.label}</span>
            </label>
          );
        })}
      </div>
      <div className="ce-foot">
        <span className="ce-total"><b>{sel.size}</b> contrainte(s)</span>
        <div className="ce-actions">
          <button className="lift-btn" onClick={() => onSave([...sel])}>Enregistrer</button>
          <button className="cont-cancel" onClick={onCancel}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

// Renders one custom field value in read mode (or nothing if empty).
function CustomKV({ field, value }) {
  if (value == null || value === '' || value === false) return null;
  let text = value === true ? 'Oui' : String(value);
  if (field.type === 'date' && value) { try { text = new Date(value).toLocaleDateString('fr-FR'); } catch (e) {} }
  return (
    <div className="kv"><span>{field.label}</span><b>{text}</b></div>
  );
}

// Edit input for one custom field, switched on type.
function CustomInput({ field, value, onChange }) {
  if (field.type === 'checkbox') {
    return (
      <label className="toggle-row">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        <span>{field.label}</span>
      </label>
    );
  }
  if (field.type === 'select') {
    return (
      <Field label={field.label}>
        <select className="inp" value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {(field.options || []).map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
        </select>
      </Field>
    );
  }
  const type = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text';
  return (
    <Field label={field.label}>
      <input className="inp" type={type} value={value == null ? '' : value} onChange={(e) => onChange(field.type === 'number' && e.target.value !== '' ? +e.target.value : e.target.value)} />
    </Field>
  );
}

// Order index of a column for history arrows.
function colLabel(id) { return COLUMN_BY_ID[id] ? COLUMN_BY_ID[id].label : (id || 'Entrée'); }

// --- Card detail: read mode by default, toggles to edit. ---
function CardDetail({ card, allCards, onClose, onSave, onDelete, onArchive }) {
  const [edit, setEdit] = useStateModal(false);
  const [draft, setDraft] = useStateModal(card);
  const [comment, setComment] = useStateModal('');
  const [delaysOpen, setDelaysOpen] = useStateModal(false);
  const [histOpen, setHistOpen] = useStateModal(false);
  const [blockForm, setBlockForm] = useStateModal(false);
  const [blockText, setBlockText] = useStateModal('');
  useEffectModal(() => { setDraft(card); setEdit(false); setComment(''); setDelaysOpen(false); setHistOpen(false); setBlockForm(false); setBlockText(''); }, [card]);
  if (!card) return null;

  const dom = DOMAIN_BY_ID[draft.rdom];
  const days = daysInColumn(card);
  const set = (k, v) => setDraft({ ...draft, [k]: v });
  const applyPatch = (patch) => onSave({ ...card, ...patch });

  const est = card.estime || 0, cons = card.consomme || 0;
  const raf = Math.max(0, est - cons);
  const over = cons > est;
  const chargeDenom = Math.max(est, cons, 1);
  const tp = (window.TYPE_BY_ID || {})[card.type];
  const gate = GATES[card.column];

  // --- Budget : graphe croisé (enveloppe RDLI · meilleur estimé · engagé · réalisé) ---
  const bReal = card.consommeBudget || 0;
  const bEst = card.estimeBudget || 0;
  const bRdli = card.budgetRdli != null ? card.budgetRdli : Math.round(bEst * 1.05);
  const bEng = card.budgetEngage != null ? card.budgetEngage : Math.round(bReal + (Math.max(bEst, bReal) - bReal) * 0.5);
  const bMax = Math.max(bRdli, bEst, bEng, bReal, 1) * 1.04;
  const budgetRows = [
    { key: 'rdli', label: 'Enveloppe RDLI', val: bRdli, color: '#94a3b8', ref: true },
    { key: 'est', label: 'Meilleur estimé', val: bEst, color: 'var(--accent)' },
    { key: 'eng', label: 'Engagé', val: bEng, color: '#b45309' },
    { key: 'real', label: 'Réalisé', val: bReal, color: bReal > bRdli ? 'var(--danger)' : 'var(--ok)' },
  ];

  // --- Ressources : familles de rôles + risque de contention (charge partagée en cours). ---
  const inFlight = (allCards || []).filter(c => ['etudes', 'prets', 'actifs'].includes(c.column));
  const resLoad = {};
  inFlight.forEach(c => (c.ressources || []).forEach(r => { resLoad[r] = (resLoad[r] || 0) + 1; }));
  const contentionSev = (n) => n >= 5 ? 'eleve' : n >= 3 ? 'moyen' : null;
  const roleGroups = {};
  (card.ressources || []).forEach(r => {
    const fam = roleOf(r);
    (roleGroups[fam] = roleGroups[fam] || []).push({ name: r, load: resLoad[r] || 1, sev: contentionSev(resLoad[r] || 0) });
  });
  const orderedRoles = ROLE_FAMILIES.filter(f => roleGroups[f.id]);

  // --- Risques ---
  const risks = card.risks || [];

  // --- Délais kanban (lead time / cycle time, reconstruits depuis l'historique). ---
  const ft = flowTimes(card);

  // --- Plan de charge : j/h par profil (typologie DSI). ---
  const profileRows = (card.chargeByProfile || [])
    .map(p => ({ ...p, fam: PROFILE_BY_ID[p.profil] || { label: p.profil, color: '#64748b' }, raf: Math.max(0, p.jh - (p.done || 0)) }))
    .sort((a, b) => b.jh - a.jh);
  const profMax = Math.max(1, ...profileRows.map(p => p.jh));
  const profTotal = profileRows.reduce((s, p) => s + p.jh, 0);
  const profDone = profileRows.reduce((s, p) => s + (p.done || 0), 0);
  const [chargeEdit, setChargeEdit] = useStateModal(false);

  // --- Risque de contention : profils en tension (checklist) + note libre. ---
  const [contEdit, setContEdit] = useStateModal(false);
  const [riskEdit, setRiskEdit] = useStateModal(false);
  const [constraintEdit, setConstraintEdit] = useStateModal(false);
  const contProfiles = (card.contentionProfiles || []).map(id => PROFILE_BY_ID[id]).filter(Boolean);
  useEffectModal(() => { setChargeEdit(false); setContEdit(false); setRiskEdit(false); setConstraintEdit(false); }, [card]);

  const addComment = () => { if (!comment.trim()) return; applyPatch({ commentaires: [...(card.commentaires || []), { user: 'vous', at: new Date().toISOString(), text: comment.trim() }] }); setComment(''); };

  // --- Date RDR (livraison) projetée ---
  const rdrMs = card.dateRDR ? new Date(card.dateRDR).getTime() : null;
  const rdrDays = rdrMs == null ? null : Math.round((rdrMs - Date.now()) / 86400000);
  const rdrFmt = rdrMs == null ? null : new Date(rdrMs).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  const rdrState = rdrDays == null ? '' : rdrDays < 0 ? 'past' : rdrDays <= 30 ? 'soon' : '';
  const rdrSub = rdrDays == null ? 'non planifiée' : rdrDays < 0 ? 'échue depuis ' + Math.abs(rdrDays) + ' j' : 'dans ' + rdrDays + ' j';
  // Blocage : commentaire obligatoire ; l'événement est journalisé dans l'historique.
  const doBlock = () => {
    const reason = blockText.trim();
    if (!reason) return;
    const now = new Date().toISOString();
    applyPatch({ blocked: true, blockReason: reason, history: [...(card.history || []), { type: 'block', reason, at: now, user: 'vous' }] });
    setBlockForm(false); setBlockText('');
  };
  const doUnblock = () => {
    const now = new Date().toISOString();
    applyPatch({ blocked: false, blockReason: '', history: [...(card.history || []), { type: 'unblock', at: now, user: 'vous' }] });
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <span className="modal-bar" style={{ background: cardBlocked(card) ? '#b91c1c' : dom.color }} />

        {!edit ? (
          <div className="modal-body">
            <div className="modal-top">
              <div>
                <h2 className="modal-name"><InlineEdit value={card.name} onCommit={(v) => v.trim() && applyPatch({ name: v.trim() })} /></h2>
                <span className="modal-code"><InlineEdit value={card.codename} placeholder="code" onCommit={(v) => applyPatch({ codename: v.trim() })} /></span>
              </div>
              <button className="x" onClick={onClose}>{'✕'}</button>
            </div>
            <div className="tag-row">
              {tp && <span className="type-tag big" style={{ background: tp.color }}>{tp.label}</span>}
              <Tag color={dom.color}>{dom.label}</Tag>
              <Tag color="#94a3b8">{LANE_BY_ID[card.canal].label}</Tag>
              <Tag color="#94a3b8">{COLUMN_BY_ID[card.column].label}</Tag>
              {card.criticality === 'top' && <Tag color="#d4a017" solid>{'♛'} TOP</Tag>}
              {card.criticality === 'major' && <Tag color="#d4a017">{'★'} MAJOR</Tag>}
              {(card.projConstraints || []).map(id => {
                const pc = PROJECT_CONSTRAINT_BY_ID[id];
                return pc ? <Tag key={id} color={pc.color}>{pc.label}</Tag> : null;
              })}
              <button className="tag-edit" title="Contraintes du projet" onClick={() => setConstraintEdit(e => !e)}>{'＋'}</button>
            </div>
            {constraintEdit && (
              <div className="constraint-pop">
                <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>Contraintes du projet</span>
                <ConstraintEditor card={card} onSave={(ids) => { applyPatch({ projConstraints: ids }); setConstraintEdit(false); }} onCancel={() => setConstraintEdit(false)} />
              </div>
            )}

            {/* Pilote du sujet (chef de projet, sous une forme compacte) */}
            <div className="owner-strip">
              <span className="owner-mono" style={{ background: dom.color }}>{(card.cp || '—').replace(/^(M\.|Mme)\s*/, '').slice(0, 1)}</span>
              <div className="owner-meta">
                <b><InlineEdit value={card.cp} placeholder="Chef de projet non assigné" onCommit={(v) => applyPatch({ cp: v.trim() })} /></b>
                <span>{LANE_BY_ID[card.canal].label} · {card.planCharge || 'plan de charge n.c.'}</span>
              </div>
              <span className="owner-since">{days} j dans {colLabel(card.column)}</span>
            </div>

            {/* Date RDR (livraison) projetée */}
            <div className={'rdr-strip ' + rdrState}>
              <span className="rdr-ic" aria-hidden="true">◷</span>
              <div className="rdr-meta">
                <span className="rdr-label">RDR · livraison projetée</span>
                <b><InlineEdit value={card.dateRDR} type="date" display={rdrFmt || '—'} toInput={(v) => v ? v.slice(0, 10) : ''} fromInput={(v) => v ? new Date(v).toISOString() : null} onCommit={(v) => applyPatch({ dateRDR: v })} /></b>
              </div>
              <span className={'rdr-eta ' + rdrState}>{rdrSub}</span>
            </div>

            {/* BUDGET : graphe croisé RDLI / estimé / engagé / réalisé */}
            <div className="sec">
              <div className="sec-head"><span className="sec-title">Budget · graphe croisé</span><span className="sec-note">k€</span></div>
              <div className="bgraph">
                {budgetRows.map(r => (
                  <div className="bg-row" key={r.key}>
                    <span className="bg-label">{r.label}</span>
                    <div className="bg-track">
                      <span className="bg-fill" style={{ width: (r.val / bMax * 100) + '%', background: r.color, opacity: r.ref ? 0.5 : 1 }} />
                      <span className="bg-ref" style={{ left: (bRdli / bMax * 100) + '%' }} />
                    </div>
                    <span className="bg-val" style={{ color: r.key === 'real' && bReal > bRdli ? 'var(--danger-strong)' : 'var(--tx-2)' }}>
                      <InlineEdit value={r.val} type="number" fromInput={(v) => v === '' ? 0 : Math.max(0, +v)} onCommit={(v) => applyPatch({ [{ rdli: 'budgetRdli', est: 'estimeBudget', eng: 'budgetEngage', real: 'consommeBudget' }[r.key]]: v })} />
                    </span>
                  </div>
                ))}
              </div>
              <div className="bg-legend">Trait vertical = enveloppe RDLI (référence d’arbitrage)</div>
            </div>

            {/* PLAN DE CHARGE : j/h par profil */}
            <div className="sec">
              <div className="sec-head">
                <span className="sec-title">Plan de charge · j/h par profil</span>
                {!chargeEdit && <button className="delay-toggle" onClick={() => setChargeEdit(true)}>Modifier</button>}
              </div>
              {chargeEdit ? (
                <ChargeEditor card={card} est={est} cons={cons} onSave={(cb) => { applyPatch({ chargeByProfile: cb }); setChargeEdit(false); }} onCancel={() => setChargeEdit(false)} />
              ) : profileRows.length === 0 ? (
                <div className="cm-empty" onClick={() => setChargeEdit(true)}>Aucune charge répartie. Cliquer pour renseigner les profils.</div>
              ) : (
                <>
                  <div className="prof-sub">{profTotal} j.h estimés · {profDone} consommés</div>
                  <div className="prof-table">
                    {profileRows.map((p, i) => (
                      <div className="prof-row" key={i}>
                        <span className="prof-name"><i className="prof-dot" style={{ background: p.fam.color }} />{p.fam.label}</span>
                        <div className="prof-track" title={(p.done || 0) + ' consommés · ' + p.raf + ' restants'}>
                          <span className="prof-done" style={{ width: (p.jh / profMax * 100) + '%', background: `color-mix(in oklab, ${p.fam.color} 22%, #fff)`, borderColor: `color-mix(in oklab, ${p.fam.color} 35%, transparent)` }} />
                          <span className="prof-fill" style={{ width: ((p.done || 0) / profMax * 100) + '%', background: p.fam.color }} />
                        </div>
                        <span className="prof-jh" title="Consommé / estimé — cliquer le consommé pour modifier">
                          <InlineEdit value={p.done || 0} type="number" className="prof-done-num" display={String(p.done || 0)}
                            fromInput={(v) => Math.max(0, Math.min(p.jh, v === '' ? 0 : +v))}
                            onCommit={(v) => applyPatch({ chargeByProfile: (card.chargeByProfile || []).map(x => x.profil === p.profil ? { ...x, done: v } : x) })} />
                          <span className="prof-slash">/</span><b>{p.jh}</b> j.h
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="prof-legend"><span><i className="pl-sw filled" /> consommé</span><span><i className="pl-sw" /> charge totale estimée</span></div>
                  {over && <div className="cs-warn">Consommé global au-delà du meilleur estimé · reste à faire à réévaluer</div>}
                </>
              )}
            </div>

            {/* RISQUE DE CONTENTION : profils en tension */}
            <div className="sec">
              <div className="sec-head">
                <span className="sec-title">Risque de contention</span>
                {!contEdit && <button className="delay-toggle" onClick={() => setContEdit(true)}>Modifier</button>}
              </div>
              {contEdit ? (
                <ContentionEditor card={card} onSave={(v) => { applyPatch({ contentionProfiles: v.profiles, contentionNote: v.note }); setContEdit(false); }} onCancel={() => setContEdit(false)} />
              ) : (contProfiles.length === 0 && !card.contentionNote) ? (
                <div className="cm-empty" onClick={() => setContEdit(true)}>Aucun profil en tension. Cliquer pour signaler.</div>
              ) : (
                <>
                  {contProfiles.length > 0 && (
                    <div className="cont-chips">
                      {contProfiles.map(p => (
                        <span className="cont-chip" key={p.id} style={{ color: `color-mix(in oklab, ${p.color} 65%, #0f172a)`, borderColor: `color-mix(in oklab, ${p.color} 40%, transparent)`, background: `color-mix(in oklab, ${p.color} 9%, #fff)` }}>
                          <i style={{ background: p.color }} />{p.label}
                        </span>
                      ))}
                    </div>
                  )}
                  {card.contentionNote && <p className="cont-note" onClick={() => setContEdit(true)} style={{ marginTop: contProfiles.length ? 9 : 0 }}>{card.contentionNote}</p>}
                </>
              )}
            </div>

            {/* RISQUES */}
            <div className="sec">
              <div className="sec-head">
                <span className="sec-title">Risques</span>
                {!riskEdit && <button className="delay-toggle" onClick={() => setRiskEdit(true)}>Modifier les risques</button>}
              </div>

              {/* Risques retenus (par entité porteuse) + description libre */}
              {riskEdit ? (
                <RiskEditor card={card} onSave={(rs) => { applyPatch({ risks: rs }); setRiskEdit(false); }} onCancel={() => setRiskEdit(false)} />
              ) : risks.length === 0 ? (
                <div className="cm-empty" onClick={() => setRiskEdit(true)}>Aucun risque retenu. Cliquer pour en ajouter.</div>
              ) : (
                <div className="risk-list">
                  {risks.map((r) => {
                    const rt = RISK_TYPE_BY_ID[r.type];
                    return (
                      <div className="risk-row" key={r.type}>
                        <span className="risk-sev" style={{ background: rt ? rt.color : '#64748b' }} />
                        {rt && <span className="ctype-tag" style={{ color: rt.color, borderColor: `color-mix(in oklab, ${rt.color} 40%, transparent)`, background: `color-mix(in oklab, ${rt.color} 8%, #fff)` }}>{rt.short}</span>}
                        <span className="risk-desc">
                          <InlineEdit value={r.desc} placeholder="décrire le risque…" onCommit={(v) => applyPatch({ risks: risks.map(x => x.type === r.type ? { ...x, desc: v } : x) })} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* BLOCAGE — juste sous les risques ; source des blocages en vue portefeuille. */}
            <div className={'sec block-sec' + (cardBlocked(card) ? ' on' : '')}>
              {cardBlocked(card) ? (
                <div className="blocked-banner">
                  <span className="blk-pulse" />
                  <span className="bb-text"><b>Bloqué</b> — {card.blockReason || 'raison non précisée'}</span>
                  <button className="lift-btn" onClick={doUnblock}>Lever</button>
                </div>
              ) : blockForm ? (
                <div className="block-form">
                  <span className="field-label">Motif du blocage (obligatoire)</span>
                  <textarea className="inp" rows="2" autoFocus placeholder="Ex. dépendance équipe Infra non livrée, attente arbitrage…" value={blockText} onChange={(e) => setBlockText(e.target.value)} />
                  <div className="modal-actions">
                    <span style={{ flex: 1 }} />
                    <button className="btn ghost" onClick={() => { setBlockForm(false); setBlockText(''); }}>Annuler</button>
                    <button className="btn danger" disabled={!blockText.trim()} onClick={doBlock}>Confirmer le blocage</button>
                  </div>
                </div>
              ) : (
                <button className="btn block-btn full" onClick={() => setBlockForm(true)}>Signaler un blocage</button>
              )}
            </div>

            {/* Champs personnalisés */}
            {(window.FIELDS || []).some(f => { const v = (card.custom || {})[f.id]; return v != null && v !== '' && v !== false; }) && (
              <div className="kv-grid">
                {(window.FIELDS || []).map(f => <CustomKV key={f.id} field={f} value={(card.custom || {})[f.id]} />)}
              </div>
            )}

            {/* Commentaires (ancre de conversation, P5) */}
            <div className="comments">
              <span className="field-label">Commentaires</span>
              {(card.commentaires || []).length === 0 && <div className="cm-empty">Aucun commentaire.</div>}
              {(card.commentaires || []).map((c, i) => (
                <div className="cm" key={i}>
                  <div className="cm-meta"><b>{c.user}</b> · {new Date(c.at).toLocaleDateString('fr-FR')}</div>
                  <div className="cm-text">{c.text}</div>
                </div>
              ))}
              <div className="cm-add">
                <input className="inp" placeholder="Ajouter un commentaire…" value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addComment(); }} />
                <button className="btn ghost sm" onClick={addComment} disabled={!comment.trim()}>Ajouter</button>
              </div>
            </div>

            {/* Délais kanban (repliable) */}
            <div className="history">
              <button className="hist-head-btn" onClick={() => setDelaysOpen(o => !o)} title={delaysOpen ? 'Replier les délais' : 'Déplier les délais'}>
                <span className="sec-title">Délais</span>
                <span className="hist-caret">{delaysOpen ? '▾' : '▸'}</span>
              </button>

              {delaysOpen && (
                <>
                  {/* Âges par étape — vraies métriques de flux, reconstruites depuis l'historique */}
                  <div className="delay-grid">
                    <div className="delay">
                      <span>Depuis Demandes</span>
                      <b className={ft.ageDemandes > 120 ? 'hot' : ft.ageDemandes > 60 ? 'warm' : ''}>{ft.ageDemandes != null ? ft.ageDemandes + ' j' : '—'}</b>
                    </div>
                    <div className="delay">
                      <span>Depuis Qualification</span>
                      <b className={ft.ageQualif > 90 ? 'hot' : ft.ageQualif > 45 ? 'warm' : ''}>{ft.ageQualif != null ? ft.ageQualif + ' j' : '—'}</b>
                    </div>
                    <div className="delay">
                      <span>Depuis 1ʳᵉ activation</span>
                      <b className={ft.ageActif > 90 ? 'hot' : ft.ageActif > 45 ? 'warm' : ''}>{ft.ageActif != null ? ft.ageActif + ' j' : 'non activé'}</b>
                    </div>
                  </div>

                  <div className="leadcycle">
                    <div className="lc">
                      <span>Lead time {ft.finished ? '' : '(en cours)'}</span>
                      <b>{ft.leadTime != null ? ft.leadTime + ' j' : '—'}</b>
                      <em>Demandes → {ft.finished ? 'Done' : 'aujourd’hui'}</em>
                    </div>
                    <div className="lc">
                      <span>Cycle time {ft.finished || !ft.tActif ? '' : '(en cours)'}</span>
                      <b>{ft.cycleTime != null ? ft.cycleTime + ' j' : 'non activé'}</b>
                      <em>Actifs → {ft.finished ? 'Done' : 'aujourd’hui'}</em>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Historique des mouvements + blocages (repliable) */}
            <div className="history">
              <button className="hist-head-btn" onClick={() => setHistOpen(o => !o)} title={histOpen ? 'Replier l’historique' : 'Déplier l’historique'}>
                <span className="sec-title">Historique</span>
                <span className="hist-caret">{histOpen ? '▾' : '▸'}</span>
              </button>

              {histOpen && (
                <div className="hist-list">
                  {card.history.slice().reverse().map((h, i) => {
                    if (h.type === 'block') return (
                      <div className="hist" key={i}>
                        <span className="hist-dot blk" />
                        <span className="hist-move"><b>Bloqué</b>{h.reason ? ' — ' + h.reason : ''}</span>
                        <span className="hist-meta">{new Date(h.at).toLocaleDateString('fr-FR')} · {h.user}</span>
                      </div>
                    );
                    if (h.type === 'unblock') return (
                      <div className="hist" key={i}>
                        <span className="hist-dot okd" />
                        <span className="hist-move"><b>Blocage levé</b></span>
                        <span className="hist-meta">{new Date(h.at).toLocaleDateString('fr-FR')} · {h.user}</span>
                      </div>
                    );
                    return (
                      <div className="hist" key={i}>
                        <span className="hist-dot" />
                        <span className="hist-move">{h.from ? colLabel(h.from) + ' → ' : ''}<b>{colLabel(h.to)}</b></span>
                        <span className="hist-meta">{new Date(h.at).toLocaleDateString('fr-FR')} · {h.user}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {card.sciformaId && <div className="scf">Réf. Sciforma : {card.sciformaId}</div>}

            <div className="modal-actions">
              <button className="btn ghost sm" onClick={() => onArchive(card)} title="Archiver ce sujet">Archiver</button>
              <span style={{ flex: 1 }} />
              <button className="btn ghost" onClick={onClose}>Fermer</button>
              <button className="btn primary" onClick={() => setEdit(true)}>Modifier</button>
            </div>
          </div>
        ) : (
          <div className="modal-body">
            <div className="modal-top">
              <h2 className="modal-name">Modifier</h2>
              <button className="x" onClick={onClose}>{'✕'}</button>
            </div>
            <Field label="Nom"><input className="inp" value={draft.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <div className="field-2col">
              <Field label="Type de projet">
                <select className="inp" value={draft.type || ''} onChange={(e) => set('type', e.target.value)}>
                  {TYPES.map(tp => <option key={tp.id} value={tp.id}>{tp.label}</option>)}
                </select>
              </Field>
              <Field label="Code projet"><input className="inp" value={draft.codename || ''} onChange={(e) => set('codename', e.target.value)} /></Field>
            </div>
            <div className="field-2col">
              <Field label="Domaine RDOM">
                <select className="inp" value={draft.rdom} onChange={(e) => set('rdom', e.target.value)}>
                  {DOMAINS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </Field>
              <Field label="Canal">
                <select className="inp" value={draft.canal} onChange={(e) => setDraft({ ...draft, canal: e.target.value, nature: natureOfCanal(e.target.value) })}>
                  {SWIMLANES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </Field>
              <Field label="Colonne">
                <select className="inp" value={draft.column} onChange={(e) => set('column', e.target.value)}>
                  {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="Criticité">
                <select className="inp" value={draft.criticality} onChange={(e) => set('criticality', e.target.value)}>
                  <option value="normal">Normal</option>
                  <option value="major">Major</option>
                  <option value="top">Top</option>
                </select>
              </Field>
              <Field label="Chef de projet"><input className="inp" value={draft.cp} onChange={(e) => set('cp', e.target.value)} /></Field>
            </div>
            <div className="field-2col">
              <Field label="Meilleur estimé (j.h)"><input className="inp" type="number" min="0" value={draft.estime == null ? '' : draft.estime} onChange={(e) => set('estime', e.target.value === '' ? null : +e.target.value)} /></Field>
              <Field label="Consommé (j.h)"><input className="inp" type="number" min="0" value={draft.consomme == null ? '' : draft.consomme} onChange={(e) => set('consomme', e.target.value === '' ? null : +e.target.value)} /></Field>
              <Field label="Plan de charge"><input className="inp" value={draft.planCharge || ''} onChange={(e) => set('planCharge', e.target.value)} /></Field>
              <Field label="Date RDR (livraison) projetée"><input className="inp" type="date" value={draft.dateRDR ? draft.dateRDR.slice(0, 10) : ''} onChange={(e) => set('dateRDR', e.target.value ? new Date(e.target.value).toISOString() : null)} /></Field>
              <Field label="Ressources clés (virgules)"><input className="inp" value={(draft.ressources || []).join(', ')} onChange={(e) => set('ressources', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} /></Field>
              <Field label="Budget estimé (k€)"><input className="inp" type="number" min="0" value={draft.estimeBudget == null ? '' : draft.estimeBudget} onChange={(e) => set('estimeBudget', e.target.value === '' ? null : +e.target.value)} /></Field>
              <Field label="Budget consommé / réalisé (k€)"><input className="inp" type="number" min="0" value={draft.consommeBudget == null ? '' : draft.consommeBudget} onChange={(e) => set('consommeBudget', e.target.value === '' ? null : +e.target.value)} /></Field>
              <Field label="Enveloppe RDLI (k€)"><input className="inp" type="number" min="0" value={draft.budgetRdli == null ? '' : draft.budgetRdli} onChange={(e) => set('budgetRdli', e.target.value === '' ? null : +e.target.value)} /></Field>
              <Field label="Budget engagé (k€)"><input className="inp" type="number" min="0" value={draft.budgetEngage == null ? '' : draft.budgetEngage} onChange={(e) => set('budgetEngage', e.target.value === '' ? null : +e.target.value)} /></Field>
            </div>
            {(window.FIELDS || []).length > 0 && (
              <div className="custom-section">
                <div className="field-label" style={{ marginBottom: 7 }}>Champs personnalisés</div>
                {(window.FIELDS || []).map(f => (
                  <CustomInput
                    key={f.id}
                    field={f}
                    value={(draft.custom || {})[f.id]}
                    onChange={(v) => set('custom', { ...(draft.custom || {}), [f.id]: v })}
                  />
                ))}
              </div>
            )}
            <Field label="Notes"><textarea className="inp" rows="2" value={draft.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
            <div className="modal-actions">
              <button className="btn danger" onClick={() => onDelete(card.id)}>Supprimer</button>
              <span style={{ flex: 1 }} />
              <button className="btn ghost" onClick={() => { setDraft(card); setEdit(false); }}>Annuler</button>
              <button className="btn primary" onClick={() => { onSave(draft); setEdit(false); }}>Enregistrer</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Quick Add: always enters Demandes (opinionated pull flow, all intake on the left). ---
function QuickAdd({ onClose, onCreate }) {
  const [d, setD] = useStateModal({ name: '', rdom: 'ingenierie', canal: 'projets', type: 'mise_en_oeuvre', cp: '', nature: natureOfCanal('projets'), criticality: 'normal' });
  const set = (k, v) => setD({ ...d, [k]: v });
  const valid = d.name.trim().length > 0;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <span className="modal-bar" style={{ background: DOMAIN_BY_ID[d.rdom].color }} />
        <div className="modal-body">
          <div className="modal-top">
            <h2 className="modal-name">Nouveau sujet</h2>
            <button className="x" onClick={onClose}>{'✕'}</button>
          </div>
          <div className="intake-note">Entre dans <b>Demandes</b> &mdash; tout sujet arrive par la gauche.</div>
          <Field label="Nom du sujet *"><input className="inp" autoFocus value={d.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <div className="field-2col">
            <Field label="Type de projet">
              <select className="inp" value={d.type} onChange={(e) => set('type', e.target.value)}>
                {TYPES.map(tp => <option key={tp.id} value={tp.id}>{tp.label}</option>)}
              </select>
            </Field>
            <Field label="Domaine RDOM">
              <select className="inp" value={d.rdom} onChange={(e) => set('rdom', e.target.value)}>
                {DOMAINS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </Field>
            <Field label="Canal">
              <select className="inp" value={d.canal} onChange={(e) => setD({ ...d, canal: e.target.value, nature: natureOfCanal(e.target.value) })}>
                {SWIMLANES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </Field>
            <Field label="Criticité">
              <select className="inp" value={d.criticality} onChange={(e) => set('criticality', e.target.value)}>
                <option value="normal">Normal</option>
                <option value="major">Major</option>
                <option value="top">Top</option>
              </select>
            </Field>
          </div>
          <Field label="Chef de projet"><input className="inp" value={d.cp} onChange={(e) => set('cp', e.target.value)} /></Field>
          <div className="modal-actions">
            <button className="btn ghost" onClick={onClose}>Annuler</button>
            <button className="btn primary" disabled={!valid} onClick={() => onCreate(d)}>Créer</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Archive view: overlay listing archived subjects, with one-click unarchive. ---
function ArchiveView({ cards, onUnarchive, onOpen, onClose }) {
  const [q, setQ] = useStateModal('');
  const list = cards.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()) || (c.codename || '').toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal archive-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-body">
          <div className="modal-top">
            <div>
              <h2 className="modal-name">Archives</h2>
              <span className="modal-code">{cards.length} sujet{cards.length > 1 ? 's' : ''} archivé{cards.length > 1 ? 's' : ''}</span>
            </div>
            <button className="x" onClick={onClose}>{'✕'}</button>
          </div>

          {cards.length > 0 && (
            <div className="arch-search-wrap">
              <input className="inp" placeholder="Rechercher dans les archives…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          )}

          {cards.length === 0 ? (
            <div className="arch-empty">
              <div className="arch-empty-title">Aucun sujet archivé</div>
              <div className="arch-empty-sub">Archivez un sujet depuis sa fiche pour le retirer du tableau sans le supprimer.</div>
            </div>
          ) : list.length === 0 ? (
            <div className="cm-empty" style={{ padding: '18px 0' }}>Aucun résultat.</div>
          ) : (
            <div className="arch-list">
              {list.map(c => {
                const tp = (window.TYPE_BY_ID || {})[c.type];
                const dom = DOMAIN_BY_ID[c.rdom];
                return (
                  <div className="arch-row" key={c.id}>
                    <button className="arch-open" onClick={() => onOpen(c)} title="Ouvrir la fiche">
                      {tp && <span className="cpop-type" style={{ background: tp.color }}>{tp.short}</span>}
                      <span className="arch-name">{c.name}</span>
                      <span className="arch-meta">{dom.short} · {LANE_BY_ID[c.canal].label} · {COLUMN_BY_ID[c.column].label}</span>
                    </button>
                    <button className="btn ghost sm" onClick={() => onUnarchive(c.id)}>Désarchiver</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CardDetail, QuickAdd, ArchiveView });
