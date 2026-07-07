// board.jsx
// The grid itself: MiniCard (radiator bar), FocusCard (expanded), Cell, BoardGrid.
// Reads config + data globals exported by config.jsx / data.jsx.

const { useState: useStateBoard, useRef: useRefBoard, useEffect: useEffectBoard } = React;

// --- Accent: how a card shows its RDOM domain (and blocked override). ---
// Returns inline style fragments for the card root + the left accent element.
function cardAccent(card, t, blocked) {
  const dom = DOMAIN_BY_ID[card.rdom];
  const color = dom.color;
  if (blocked) {
    if (t.blockedStyle === 'wash') {
      return { root: { background: '#f8b4b4', boxShadow: 'inset 0 0 0 1px #b91c1c' }, accent: { background: '#b91c1c', width: 4 } };
    }
    if (t.blockedStyle === 'stripe') {
      return { root: { background: '#fcd2d2' }, accent: { background: 'repeating-linear-gradient(45deg,#b91c1c 0 4px,#f08a8a 4px 8px)', width: 6 } };
    }
    return { root: { background: '#f9c0c0', boxShadow: 'inset 0 0 0 1px #dc2626, inset 3px 0 0 #b91c1c' }, accent: { background: '#b91c1c', width: 4 } };
  }
  if (t.domainStyle === 'tint') {
    return { root: { background: `color-mix(in oklab, ${color} 13%, var(--bg-card))` }, accent: { background: color } };
  }
  if (t.domainStyle === 'dot') {
    return { root: {}, accent: { background: 'transparent' }, dot: color };
  }
  return { root: {}, accent: { background: color } }; // 'bar'
}

// --- Age visualization, switchable via the aging tweak. ---
// Light-mode aging keeps text dark (AA contrast preserved) and signals age via
// background tone, desaturation, or a colored edge — never by dimming the text.
function agingDecor(days, t) {
  // 'aucun' (défaut) : l’âge est porté uniquement par la pastille texte (3j/2s/4m),
  // le fond reste blanc — lecture calme, pas de bruit chromatique.
  if (!t.agingStyle || t.agingStyle === 'aucun') return {};
  const alpha = decayAlpha(days);
  const cat = ageCategory(days);
  if (t.agingStyle === 'desaturate') {
    return { filter: alpha ? `grayscale(${Math.min(1, alpha * 1.3)}) brightness(${1 - alpha * 0.12})` : 'none' };
  }
  if (t.agingStyle === 'edge') {
    const c = cat === 'stale' ? 'var(--danger)' : cat === 'aging' ? 'var(--warn)' : cat === 'recent' ? 'var(--tx-4)' : 'transparent';
    return { ageEdge: c };
  }
  // 'fade' (default): fresh = crisp white, stale = dusty paper. Text stays #0f172a.
  return { bg: alpha ? `color-mix(in oklab, #b3a890 ${Math.round(alpha * 72)}%, var(--bg-card))` : null };
}

// Compose the final card background from blocked / domain-tint / aging.
function cardBg(acc, dec, t, blocked) {
  if (!blocked && dec.bg && t.domainStyle !== 'tint') return dec.bg;
  return acc.root.background;
}

// Criticality marker: top = gold crown, major = gold star, normal = none.
const CrownSVG = ({ s }) => (
  <svg className="crit-crown" width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M2 7l4.5 3.5L12 3l5.5 7.5L22 7l-1.8 12H3.8L2 7z" fill="#d4a017" stroke="#a16207" strokeWidth="1" strokeLinejoin="round" />
  </svg>
);
function CritMark({ c, big }) {
  if (c === 'top') return <CrownSVG s={big ? 16 : 12} />;
  if (c === 'major') return <span className="crit-star" style={{ fontSize: big ? 14 : 11 }}>{'★'}</span>;
  return null;
}

// Badges for custom fields pinned to the card (admin: "badge" checkbox).
function CustomBadges({ card }) {
  const fields = (window.FIELDS || []).filter(f => f.showOnCard);
  if (!fields.length) return null;
  return (
    <React.Fragment>
      {fields.map(f => {
        const v = (card.custom || {})[f.id];
        if (v == null || v === '' || v === false) return null;
        let color = null;
        let text = v === true ? f.label : String(v);
        if (f.type === 'select') { const o = (f.options || []).find(o => o.label === v); if (o) color = o.color; }
        const style = color
          ? { background: `color-mix(in oklab, ${color} 16%, #fff)`, color: `color-mix(in oklab, ${color} 62%, #0f172a)` }
          : { background: '#e8ecf3', color: '#334155' };
        return <span key={f.id} className="badge" style={style}>{text}</span>;
      })}
    </React.Fragment>
  );
}

// Compact budget read-out (meilleur estimé vs consommé) for the expanded card.
function EstimeBar({ card }) {
  if (card.estimeBudget == null && card.estime == null) return null;
  const est = card.estimeBudget != null ? card.estimeBudget : card.estime;
  const cons = card.estimeBudget != null ? (card.consommeBudget || 0) : (card.consomme || 0);
  const unit = card.estimeBudget != null ? 'k€' : 'j.h';
  const pct = est ? Math.round(cons / est * 100) : 0;
  const over = cons > est;
  return (
    <div className="ec-row" title={`Meilleur estimé ${est} ${unit} · Consommé ${cons} ${unit}`}>
      <span className="ec-label">{cons} / {est} {unit}</span>
      <span className="ec-track"><span className="ec-fill" style={{ width: Math.min(100, pct) + '%', background: over ? 'var(--danger)' : pct >= 85 ? 'var(--warn)' : 'var(--accent)' }} /></span>
    </div>
  );
}

// Prominent type-of-project tag (more visible than the domain): filled color pill.
function TypeTag({ type, big }) {
  const tp = (window.TYPE_BY_ID || {})[type];
  if (!tp) return null;
  return <span className={'type-tag' + (big ? ' big' : '')} style={{ background: tp.color }} title={tp.label}>{big ? tp.label : tp.short}</span>;
}

function ageTextClass(days) {
  const cat = ageCategory(days);
  return cat === 'stale' ? 'age stale' : cat === 'aging' ? 'age aging' : 'age';
}

// --- Radiator bar: ~16px, the default whole-portfolio view. ---
function MiniCard({ card, t, showCodes, onOpen, onDragStart, onDragEnd }) {
  const days = daysInColumn(card);
  const acc = cardAccent(card, t, card.blocked);
  const dec = agingDecor(days, t);
  return (
    <div
      className={'mini' + (card.dimmed ? ' dimmed' : '')}
      draggable
      onClick={() => onOpen(card)}
      onDragStart={(e) => onDragStart(e, card)}
      onDragEnd={onDragEnd}
      style={{ height: t.density, ...acc.root, background: cardBg(acc, dec, t, card.blocked), filter: dec.filter }}
      title={`${card.name}  ·  ${(window.TYPE_BY_ID[card.type] || {}).label || ''}  ·  ${DOMAIN_BY_ID[card.rdom].label}  ·  ${card.cp}  ·  ${days}j`}
    >
      <span className="mini-accent" style={acc.accent} />
      {acc.dot && <span className="mini-dot" style={{ background: acc.dot }} />}
      {card.blocked && t.blockedStyle !== 'wash' && <span className="blk-pulse" />}
      <CritMark c={card.criticality} />
      <TypeTag type={card.type} />
      {showCodes && <span className="mini-code">{card.codename}</span>}
      <span className="mini-name">{card.name}</span>
      <span className={ageTextClass(days)}>{ageLabel(days)}</span>
      {dec.ageEdge && <span className="age-edge" style={{ background: dec.ageEdge }} />}
    </div>
  );
}

// --- Expanded card shown when its column is in focus (~65px). ---
function FocusCard({ card, t, showCodes, onOpen, onDragStart, onDragEnd }) {
  const days = daysInColumn(card);
  const dom = DOMAIN_BY_ID[card.rdom];
  const acc = cardAccent(card, t, card.blocked);
  const dec = agingDecor(days, t);
  return (
    <div
      className={'focus-card' + (card.dimmed ? ' dimmed' : '')}
      draggable
      onClick={() => onOpen(card)}
      onDragStart={(e) => onDragStart(e, card)}
      onDragEnd={onDragEnd}
      style={{ ...acc.root, background: cardBg(acc, dec, t, card.blocked), filter: dec.filter }}
    >
      <span className="focus-accent" style={acc.accent} />
      {acc.dot && <span className="mini-dot" style={{ background: acc.dot, top: 8 }} />}
      <div className="focus-body">
        <div className="focus-line1">
          {card.blocked && t.blockedStyle !== 'wash' && <span className="blk-pulse" />}
          <CritMark c={card.criticality} big />
          <span className="focus-name">{card.name}</span>
          <span className={ageTextClass(days)}>{ageLabel(days)}</span>
        </div>
        <div className="focus-line2">
          <TypeTag type={card.type} big />
          <span className="dom-pill" style={{ color: `color-mix(in oklab, ${dom.color} 58%, #0f172a)`, borderColor: `color-mix(in oklab, ${dom.color} 42%, transparent)`, background: `color-mix(in oklab, ${dom.color} 12%, #fff)` }}>{dom.short}</span>
          <span className="muted">{card.cp}</span>
          {showCodes && <span className="focus-code">{card.codename}</span>}
          {card.criticality !== 'normal' && (
            <span className={'badge crit-' + card.criticality}>{CRITICALITY[card.criticality].badge}</span>
          )}
          <CustomBadges card={card} />
        </div>
        {card.blocked && <div className="focus-block">{card.blockReason}</div>}
        <EstimeBar card={card} />
      </div>
      {dec.ageEdge && <span className="age-edge" style={{ background: dec.ageEdge }} />}
    </div>
  );
}

// --- A single (lane x column) cell with WIP heat + blocked badge + gate line. ---
function Cell({ lane, column, cards, focused, t, wipLimit, onSetWip, showCodes, dragOver, onOpen, onDragStart, onDragEnd, onDrop, onDragOverCell, onDragLeaveCell }) {
  const [editing, setEditing] = useStateBoard(false);
  const list = cards.filter(c => c.canal === lane.id && c.column === column.id && !c.hidden);
  const visible = list.filter(c => !c.dimmed);
  const blockedCount = list.filter(c => c.blocked).length;
  const n = list.length;
  const limit = wipLimit === undefined ? column.wip : wipLimit;
  const ratio = limit ? n / limit : 0;
  const wipState = !limit ? 'na' : ratio > 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok';
  const gate = GATES[column.id];

  // Scroll hint: show a fading down-arrow while the cell can scroll further down.
  const cardsRef = useRefBoard(null);
  const [scrollHint, setScrollHint] = useStateBoard(false);
  const updateHint = () => {
    const el = cardsRef.current;
    if (!el) return;
    setScrollHint(el.scrollHeight - el.clientHeight - el.scrollTop > 4);
  };
  useEffectBoard(() => { updateHint(); }, [list.length, focused]);

  const commit = (e) => {
    const raw = e.target.value.trim();
    onSetWip(lane.id, column.id, raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0));
    setEditing(false);
  };

  return (
    <div
      className={'cell' + (focused ? ' focused' : '') + (dragOver ? ' dragover' : '')}
      data-wip={wipState}
      onDragOver={(e) => onDragOverCell(e, lane, column)}
      onDragLeave={onDragLeaveCell}
      onDrop={(e) => onDrop(e, lane, column)}
    >
      {limit ? <span className="cell-cap" data-wip={wipState} style={{ width: Math.min(100, ratio * 100) + '%' }} /> : null}
      {gate && <span className="gate-line" style={{ '--gate': gate.color }} title={gate.code + ' — ' + gate.label} />}
      <div className="cell-head">
        {editing ? (
          <span className="wip-edit-wrap" onClick={(e) => e.stopPropagation()}>
            <span className="wip-edit-label">Limite d’encours</span>
            <input
              className="wip-edit" type="number" min="0" autoFocus
              defaultValue={limit == null ? '' : limit}
              placeholder="∞"
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); else if (e.key === 'Escape') setEditing(false); }}
            />
          </span>
        ) : (
          <span className="wip-display">
            <span className="wip-cap-label">Limite d’encours</span>
            <button
              className={'wip-chip ' + wipState}
              onClick={(e) => { e.stopPropagation(); setEditing(true); }}
              title="Limite d’encours — cliquer pour modifier"
            >
              <span className="wip-n">{n}</span>
              <span className="wip-slash">/</span>
              <span className="wip-lim">{limit == null ? '∞' : limit}</span>
            </button>
          </span>
        )}
        {blockedCount > 0 && <span className="cell-blocked">{blockedCount}</span>}
      </div>
      <div className="cell-cards" ref={cardsRef} onScroll={updateHint}>
        {list.map(card =>
          focused
            ? <FocusCard key={card.id} card={card} t={t} showCodes={showCodes} onOpen={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd} />
            : <MiniCard key={card.id} card={card} t={t} showCodes={showCodes} onOpen={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd} />
        )}
        {n === 0 && <span className="cell-empty" />}
      </div>
      <span className={'scroll-hint' + (scrollHint ? ' on' : '')} aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    </div>
  );
}

Object.assign(window, { MiniCard, FocusCard, Cell, CritMark, EstimeBar, TypeTag });
