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
function CardDetail({ card, onClose, onSave, onDelete }) {
  const [edit, setEdit] = useStateModal(false);
  const [draft, setDraft] = useStateModal(card);
  const [blockForm, setBlockForm] = useStateModal(false);
  const [blockText, setBlockText] = useStateModal('');
  const [comment, setComment] = useStateModal('');
  useEffectModal(() => { setDraft(card); setEdit(false); setBlockForm(false); setBlockText(''); setComment(''); }, [card]);
  if (!card) return null;

  const dom = DOMAIN_BY_ID[draft.rdom];
  const days = daysInColumn(card);
  const set = (k, v) => setDraft({ ...draft, [k]: v });
  const applyPatch = (patch) => onSave({ ...card, ...patch });

  const est = card.estime || 0, cons = card.consomme || 0;
  const pct = est ? Math.round(cons / est * 100) : 0;
  const over = cons > est;
  const estB = card.estimeBudget || 0, consB = card.consommeBudget || 0;
  const pctB = estB ? Math.round(consB / estB * 100) : 0;
  const overB = consB > estB;
  const tp = (window.TYPE_BY_ID || {})[card.type];
  const gate = GATES[card.column];

  const addComment = () => { if (!comment.trim()) return; applyPatch({ commentaires: [...(card.commentaires || []), { user: 'vous', at: new Date().toISOString(), text: comment.trim() }] }); setComment(''); };
  const reportBlock = () => { applyPatch({ blocked: true, blockReason: blockText.trim() || 'Blocage signalé' }); setBlockForm(false); setBlockText(''); };
  const liftBlock = () => applyPatch({ blocked: false, blockReason: '' });

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <span className="modal-bar" style={{ background: card.blocked ? '#b91c1c' : dom.color }} />

        {!edit ? (
          <div className="modal-body">
            <div className="modal-top">
              <div>
                <h2 className="modal-name">{card.name}</h2>
                {card.codename && <span className="modal-code">{card.codename}</span>}
              </div>
              <button className="x" onClick={onClose}>{'✕'}</button>
            </div>
            <div className="tag-row">
              {tp && <span className="type-tag big" style={{ background: tp.color }}>{tp.label}</span>}
              <Tag color={dom.color}>{dom.label}</Tag>
              <Tag color="#94a3b8">{LANE_BY_ID[card.canal].label}</Tag>
              <Tag color="#94a3b8">{COLUMN_BY_ID[card.column].label}</Tag>
              <Tag color={NATURE[card.nature].fg}>{NATURE[card.nature].label}</Tag>
              {card.criticality === 'top' && <Tag color="#eab308" solid>{'★'} TOP</Tag>}
              {card.criticality === 'major' && <Tag color="#cbd5e1">MAJOR</Tag>}
            </div>

            {card.blocked && (
              <div className="alert-box">
                <span className="blk-pulse" /> <b>Bloqué</b> &mdash; {card.blockReason || 'raison non précisée'}
                <button className="lift-btn" onClick={liftBlock}>Lever</button>
              </div>
            )}

            <div className="kv-grid">
              <div className="kv"><span>Chef de projet</span><b>{card.cp || '—'}</b></div>
              <div className="kv"><span>Dans la colonne depuis</span><b className={days > 60 ? 'hot' : days > 28 ? 'warm' : ''}>{days} jours</b></div>
              <div className="kv"><span>Plan de charge</span><b>{card.planCharge || '—'}</b></div>
              <div className="kv"><span>Mouvements</span><b>{card.history.length}</b></div>
              {(window.FIELDS || []).map(f => <CustomKV key={f.id} field={f} value={(card.custom || {})[f.id]} />)}
            </div>

            {/* Charge : meilleur estimé vs consommé (jours-homme + budget) */}
            <div className="charge-box">
              <div className="charge-head">
                <span className="field-label">Charge · jours-homme</span>
                <span className={'charge-num' + (over ? ' over' : '')}>{cons} / {est} j.h{over ? ' · dépassement' : ''}</span>
              </div>
              <div className="charge-track"><span className="charge-fill" style={{ width: Math.min(100, pct) + '%', background: over ? 'var(--danger)' : pct >= 85 ? 'var(--warn)' : 'var(--accent)' }} /></div>
              <div className="charge-head" style={{ marginTop: 9 }}>
                <span className="field-label">Budget · k€</span>
                <span className={'charge-num' + (overB ? ' over' : '')}>{consB} / {estB} k€{overB ? ' · dépassement' : ''}</span>
              </div>
              <div className="charge-track"><span className="charge-fill" style={{ width: Math.min(100, pctB) + '%', background: overB ? 'var(--danger)' : pctB >= 85 ? 'var(--warn)' : 'var(--ok)' }} /></div>
            </div>

            {card.ressources && card.ressources.length > 0 && (
              <div className="res-box">
                <span className="field-label">Ressources clés</span>
                <div className="res-chips">{card.ressources.map((r, i) => <span key={i} className="res-chip">{r}</span>)}</div>
              </div>
            )}

            {/* Documents de référence */}
            <div className="doc-row">
              <a className="doclink" href="#" onClick={(e) => e.preventDefault()} title="Definition of Ready — à connecter au référentiel">{'📄'} DoR</a>
              <a className="doclink" href="#" onClick={(e) => e.preventDefault()} title="Definition of Done — à connecter au référentiel">{'📄'} DoD</a>
              {gate && <span className="doc-gate" style={{ color: gate.color }}>Gate {gate.code} à l’entrée de cette colonne</span>}
            </div>

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

            {/* Historique des mouvements */}
            <div className="history">
              <span className="field-label">Historique</span>
              <div className="hist-list">
                {card.history.slice().reverse().map((h, i) => (
                  <div className="hist" key={i}>
                    <span className="hist-dot" />
                    <span className="hist-move">{h.from ? colLabel(h.from) + ' → ' : ''}<b>{colLabel(h.to)}</b></span>
                    <span className="hist-meta">{new Date(h.at).toLocaleDateString('fr-FR')} · {h.user}</span>
                  </div>
                ))}
              </div>
            </div>

            {card.sciformaId && <div className="scf">Réf. Sciforma : {card.sciformaId}</div>}

            <div className="modal-actions">
              {!card.blocked && !blockForm && <button className="btn block-btn" onClick={() => setBlockForm(true)}>Signaler un blocage</button>}
              <span style={{ flex: 1 }} />
              <button className="btn ghost" onClick={onClose}>Fermer</button>
              <button className="btn primary" onClick={() => setEdit(true)}>Modifier</button>
            </div>

            {blockForm && (
              <div className="block-form">
                <span className="field-label">Décrire le blocage précisément</span>
                <textarea className="inp" rows="2" autoFocus placeholder="Ex. dépendance équipe Infra non livrée, attente arbitrage…" value={blockText} onChange={(e) => setBlockText(e.target.value)} />
                <div className="modal-actions">
                  <span style={{ flex: 1 }} />
                  <button className="btn ghost" onClick={() => setBlockForm(false)}>Annuler</button>
                  <button className="btn danger" onClick={reportBlock}>Signaler le blocage</button>
                </div>
              </div>
            )}
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
                <select className="inp" value={draft.canal} onChange={(e) => set('canal', e.target.value)}>
                  {SWIMLANES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </Field>
              <Field label="Colonne">
                <select className="inp" value={draft.column} onChange={(e) => set('column', e.target.value)}>
                  {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="Nature">
                <select className="inp" value={draft.nature} onChange={(e) => set('nature', e.target.value)}>
                  <option value="simple">Clair</option>
                  <option value="complicated">Compliqué</option>
                  <option value="complex">Complexe</option>
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
            <label className="toggle-row">
              <input type="checkbox" checked={draft.blocked} onChange={(e) => set('blocked', e.target.checked)} />
              <span>Bloqué</span>
            </label>
            {draft.blocked && <Field label="Raison du blocage"><input className="inp" value={draft.blockReason} onChange={(e) => set('blockReason', e.target.value)} /></Field>}
            <div className="field-2col">
              <Field label="Meilleur estimé (j.h)"><input className="inp" type="number" min="0" value={draft.estime == null ? '' : draft.estime} onChange={(e) => set('estime', e.target.value === '' ? null : +e.target.value)} /></Field>
              <Field label="Consommé (j.h)"><input className="inp" type="number" min="0" value={draft.consomme == null ? '' : draft.consomme} onChange={(e) => set('consomme', e.target.value === '' ? null : +e.target.value)} /></Field>
              <Field label="Plan de charge"><input className="inp" value={draft.planCharge || ''} onChange={(e) => set('planCharge', e.target.value)} /></Field>
              <Field label="Ressources clés (virgules)"><input className="inp" value={(draft.ressources || []).join(', ')} onChange={(e) => set('ressources', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} /></Field>
              <Field label="Budget estimé (k€)"><input className="inp" type="number" min="0" value={draft.estimeBudget == null ? '' : draft.estimeBudget} onChange={(e) => set('estimeBudget', e.target.value === '' ? null : +e.target.value)} /></Field>
              <Field label="Budget consommé (k€)"><input className="inp" type="number" min="0" value={draft.consommeBudget == null ? '' : draft.consommeBudget} onChange={(e) => set('consommeBudget', e.target.value === '' ? null : +e.target.value)} /></Field>
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
  const [d, setD] = useStateModal({ name: '', rdom: 'ingenierie', canal: 'projets', type: 'mise_en_oeuvre', cp: '', nature: 'simple', criticality: 'normal' });
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
              <select className="inp" value={d.canal} onChange={(e) => set('canal', e.target.value)}>
                {SWIMLANES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </Field>
            <Field label="Nature">
              <select className="inp" value={d.nature} onChange={(e) => set('nature', e.target.value)}>
                <option value="simple">Clair</option>
                <option value="complicated">Compliqué</option>
                <option value="complex">Complexe</option>
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

Object.assign(window, { CardDetail, QuickAdd });
