// admin.jsx
// The Configuration panel (admin-only by intent). Edits a DRAFT of the board
// config; nothing applies until "Appliquer". Structure | Catégories | Champs.

const { useState: useStateAdm } = React;

// Stable-ish id from a label (new columns/domains/fields).
function slugId(label) {
  const base = (label || 'item').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return base + '_' + Math.random().toString(36).slice(2, 6);
}

const FIELD_TYPES = [
  { id: 'text', label: 'Texte' },
  { id: 'number', label: 'Nombre' },
  { id: 'date', label: 'Date' },
  { id: 'select', label: 'Choix (liste)' },
  { id: 'checkbox', label: 'Case à cocher' },
  { id: 'person', label: 'Personne' },
];

const OPTION_PALETTE = ['#2563eb', '#047857', '#b45309', '#7c3aed', '#dc2626', '#0e7490', '#be185d', '#4d7c0f'];

// Move list[i] one step up/down, returning a new list.
function moveItem(list, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = list.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function AdminPanel({ cfg, onApply, onClose }) {
  const [draft, setDraft] = useStateAdm(() => {
    const d = JSON.parse(JSON.stringify(cfg));
    if (!d.types) d.types = JSON.parse(JSON.stringify(window.TYPES || []));
    return d;
  });
  const [tab, setTab] = useStateAdm('structure');
  const set = (k, v) => setDraft({ ...draft, [k]: v });
  const upd = (listKey, i, patch) => set(listKey, draft[listKey].map((x, idx) => idx === i ? { ...x, ...patch } : x));

  const tabs = [['structure', 'Structure'], ['categories', 'Catégories'], ['champs', 'Champs de carte']];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal admin-modal" onClick={(e) => e.stopPropagation()}>
        <span className="modal-bar" style={{ background: '#1d4ed8' }} />
        <div className="modal-body">
          <div className="modal-top">
            <h2 className="modal-name">Configuration du tableau</h2>
            <button className="x" onClick={onClose}>{'✕'}</button>
          </div>
          <div className="atabs">
            {tabs.map(([id, label]) => (
              <button key={id} className={'atab' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>

          {tab === 'structure' && (
            <div className="apane">
              <div className="asection-label">Colonnes (flux, de gauche à droite)</div>
              {draft.columns.map((c, i) => (
                <div className="arow" key={c.id}>
                  <span className="amove">
                    <button className="abtn" disabled={i === 0} onClick={() => set('columns', moveItem(draft.columns, i, -1))}>{'↑'}</button>
                    <button className="abtn" disabled={i === draft.columns.length - 1} onClick={() => set('columns', moveItem(draft.columns, i, 1))}>{'↓'}</button>
                  </span>
                  <input className="ainp grow" value={c.label} onChange={(e) => upd('columns', i, { label: e.target.value })} />
                  <input className="ainp wip-inp" type="number" min="0" placeholder="WIP" title="Limite WIP (vide = aucune)" value={c.wip == null ? '' : c.wip} onChange={(e) => upd('columns', i, { wip: e.target.value === '' ? null : +e.target.value })} />
                  <select className="ainp gate-inp" title="Gate à l'entrée" value={c.gate || ''} onChange={(e) => upd('columns', i, { gate: e.target.value || undefined })}>
                    <option value="">— gate</option>
                    <option value="DoR">DoR</option>
                    <option value="DoD">DoD</option>
                  </select>
                  <button className="abtn del" disabled={draft.columns.length <= 2} title="Supprimer (les sujets seront déplacés)" onClick={() => set('columns', draft.columns.filter((_, idx) => idx !== i))}>{'✕'}</button>
                </div>
              ))}
              <button className="a-add" onClick={() => set('columns', [...draft.columns, { id: slugId('colonne'), label: 'Nouvelle colonne', wip: null, note: '' }])}>+ Ajouter une colonne</button>

              <div className="asection-label">Canaux (couloirs, de haut en bas)</div>
              {draft.lanes.map((l, i) => (
                <div className="arow" key={l.id}>
                  <span className="amove">
                    <button className="abtn" disabled={i === 0} onClick={() => set('lanes', moveItem(draft.lanes, i, -1))}>{'↑'}</button>
                    <button className="abtn" disabled={i === draft.lanes.length - 1} onClick={() => set('lanes', moveItem(draft.lanes, i, 1))}>{'↓'}</button>
                  </span>
                  <input className="ainp grow" value={l.label} onChange={(e) => upd('lanes', i, { label: e.target.value })} />
                  <input className="ainp nature-inp" title="Sous-titre (nature)" value={l.nature} onChange={(e) => upd('lanes', i, { nature: e.target.value })} />
                  <button className="abtn del" disabled={draft.lanes.length <= 1} title="Supprimer (les sujets seront déplacés)" onClick={() => set('lanes', draft.lanes.filter((_, idx) => idx !== i))}>{'✕'}</button>
                </div>
              ))}
              <button className="a-add" onClick={() => set('lanes', [...draft.lanes, { id: slugId('canal'), label: 'Nouveau canal', nature: '', detail: '' }])}>+ Ajouter un canal</button>
            </div>
          )}

          {tab === 'categories' && (
            <div className="apane">
              <div className="asection-label">Domaines RDOM</div>
              {draft.domains.map((d, i) => (
                <div className="arow" key={d.id}>
                  <input className="acolor" type="color" value={d.color} onChange={(e) => upd('domains', i, { color: e.target.value })} />
                  <input className="ainp grow" value={d.label} onChange={(e) => upd('domains', i, { label: e.target.value })} />
                  <input className="ainp short-inp" maxLength="3" title="Code court (3 lettres)" value={d.short} onChange={(e) => upd('domains', i, { short: e.target.value.toUpperCase() })} />
                  <button className="abtn del" disabled={draft.domains.length <= 1} onClick={() => set('domains', draft.domains.filter((_, idx) => idx !== i))}>{'✕'}</button>
                </div>
              ))}
              <button className="a-add" onClick={() => set('domains', [...draft.domains, { id: slugId('domaine'), label: 'Nouveau domaine', short: 'NEW', color: OPTION_PALETTE[draft.domains.length % OPTION_PALETTE.length] }])}>+ Ajouter un domaine</button>

              <div className="asection-label">Types de projet (plus visibles que le domaine sur la carte)</div>
              {(draft.types || []).map((tp, i) => (
                <div className="arow" key={tp.id}>
                  <input className="acolor" type="color" value={tp.color} onChange={(e) => upd('types', i, { color: e.target.value })} />
                  <input className="ainp grow" value={tp.label} onChange={(e) => upd('types', i, { label: e.target.value })} />
                  <input className="ainp short-inp" maxLength="3" title="Code court" value={tp.short} onChange={(e) => upd('types', i, { short: e.target.value.toUpperCase() })} />
                  <button className="abtn del" disabled={(draft.types || []).length <= 1} onClick={() => set('types', draft.types.filter((_, idx) => idx !== i))}>{'✕'}</button>
                </div>
              ))}
              <button className="a-add" onClick={() => set('types', [...(draft.types || []), { id: slugId('type'), label: 'Nouveau type', short: 'NEW', color: OPTION_PALETTE[(draft.types || []).length % OPTION_PALETTE.length] }])}>+ Ajouter un type</button>

              <div className="asection-label">Natures (détectées à la RDO — renommables, non extensibles)</div>
              {Object.entries(draft.natures).map(([k, n]) => (
                <div className="arow" key={k}>
                  <input className="acolor" type="color" value={n.fg} onChange={(e) => set('natures', { ...draft.natures, [k]: { ...n, fg: e.target.value, bg: e.target.value + '22' } })} />
                  <input className="ainp grow" value={n.label} onChange={(e) => set('natures', { ...draft.natures, [k]: { ...n, label: e.target.value } })} />
                </div>
              ))}

              <div className="asection-label">Criticités (renommables)</div>
              {Object.entries(draft.crits).map(([k, c]) => (
                <div className="arow" key={k}>
                  <span className="crit-key">{k === 'top' ? '★' : k === 'major' ? '◆' : '·'}</span>
                  <input className="ainp grow" value={c.label} onChange={(e) => set('crits', { ...draft.crits, [k]: { ...c, label: e.target.value, badge: c.badge ? e.target.value.toUpperCase() : null } })} />
                </div>
              ))}
            </div>
          )}

          {tab === 'champs' && (
            <div className="apane">
              <div className="asection-label">Champs personnalisés (panneau de détail · badge optionnel sur la carte)</div>
              {draft.fields.length === 0 && <div className="a-empty">Aucun champ personnalisé. Les cartes restent minimales par défaut.</div>}
              {draft.fields.map((f, i) => (
                <div className="afield" key={f.id}>
                  <div className="arow">
                    <input className="ainp grow" placeholder="Nom du champ" value={f.label} onChange={(e) => upd('fields', i, { label: e.target.value })} />
                    <select className="ainp type-inp" value={f.type} onChange={(e) => upd('fields', i, { type: e.target.value })}>
                      {FIELD_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                    <label className="a-check" title="Afficher comme badge sur la carte (mode focus)">
                      <input type="checkbox" checked={!!f.showOnCard} onChange={(e) => upd('fields', i, { showOnCard: e.target.checked })} /> badge
                    </label>
                    <button className="abtn del" onClick={() => set('fields', draft.fields.filter((_, idx) => idx !== i))}>{'✕'}</button>
                  </div>
                  {f.type === 'select' && (
                    <input
                      className="ainp opt-inp"
                      placeholder="Options séparées par des virgules, ex. S1, S2, S3"
                      value={(f.options || []).map(o => o.label).join(', ')}
                      onChange={(e) => {
                        const labels = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                        const prev = f.options || [];
                        upd('fields', i, { options: labels.map((lb, idx) => prev.find(o => o.label === lb) || { label: lb, color: OPTION_PALETTE[idx % OPTION_PALETTE.length] }) });
                      }}
                    />
                  )}
                </div>
              ))}
              <button className="a-add" onClick={() => set('fields', [...draft.fields, { id: slugId('champ'), label: 'Nouveau champ', type: 'text', showOnCard: false }])}>+ Ajouter un champ</button>
            </div>
          )}

          <div className="modal-actions">
            <button className="btn danger" title="Revenir au modèle NMO d’origine (colonnes, canaux, domaines, champs)" onClick={() => { if (confirm('Revenir au modèle NMO d’origine ? Les colonnes, canaux, domaines et champs personnalisés seront réinitialisés.')) onApply(defaultBoardConfig()); }}>Réinitialiser le modèle</button>
            <span style={{ flex: 1 }} />
            <button className="btn ghost" onClick={onClose}>Annuler</button>
            <button className="btn primary" onClick={() => onApply(draft)}>Appliquer</button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AdminPanel });
