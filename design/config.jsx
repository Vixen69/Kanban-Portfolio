// config.jsx
// Single source of truth for the board's architecture.
// The NMO operational model IS this configuration (Design Principle P6).
// A developer changes the model by editing these arrays — nothing else.

// --- Flow stages (left to right). Movement rightward IS the governance decision. ---
const COLUMNS = [
  { id: 'demandes',      label: 'Demandes',      wip: 7,  note: 'File d’entrée · priorité verticale' },
  { id: 'qualification', label: 'Qualification', wip: 6,  note: 'RDO · détection de nature' },
  { id: 'etudes',        label: 'Études',        wip: 7,  note: 'DAAT · estimation · dépendances' },
  { id: 'prets',         label: 'Prêts',         wip: 5,  gate: 'DoR', note: 'Qualifié, estimé — tiré par l’équipe' },
  { id: 'pause',         label: 'Pause',         wip: null, note: 'Mise en pause — repli pour piloter le flux' },
  { id: 'actifs',        label: 'Actifs',        wip: 6,  note: 'En cours · Andon si bloqué > 5j', hasBlockedZone: true },
  { id: 'done',          label: 'Done',          wip: 6,  gate: 'DoD', note: 'DoD atteinte · PV Reprise d’Exploitation' },
  { id: 'exploitation',  label: 'Exploitation',  wip: null, note: 'En production · état terminal' },
];

// --- Operational canaux (top to bottom). Each = a different work nature & governance weight. ---
const SWIMLANES = [
  { id: 'projets',           label: 'Projets',           nature: 'Compliqué',  detail: 'Séquence de gates complète · architecture obligatoire' },
  { id: 'petits_projets',    label: 'Petits Projets',    nature: 'Clair',       detail: 'RTM-lite · 1 équipe · ≤ 3 mois' },
  { id: 'projets_complexes', label: 'Projets Complexes', nature: 'Complexe',    detail: 'RDLI incrémental · MVP avant engagement' },
];

// --- The 9 responsible domains (RDOM). Hue-diverse so they read at 14px and color-blind. ---
const DOMAINS = [
  { id: 'ingenierie', label: 'Ingénierie',  short: 'ING', color: '#10b981' },
  { id: 'soutien',    label: 'Soutien',     short: 'SOU', color: '#6366f1' },
  { id: 'industrie',  label: 'Industrie',   short: 'IND', color: '#f59e0b' },
  { id: 'corporate',  label: 'Corporate',   short: 'COR', color: '#8b5cf6' },
  { id: 'erp',        label: 'ERP',         short: 'ERP', color: '#ef4444' },
  { id: 'plm',        label: 'PLM',         short: 'PLM', color: '#06b6d4' },
  { id: 'infra',      label: 'Infra',       short: 'INF', color: '#ec4899' },
  { id: 'archi_dev',  label: 'Archi & Dev', short: 'A&D', color: '#14b8a6' },
  { id: 'cyber',      label: 'Cyber',       short: 'CYB', color: '#f97316' },
];

const DOMAIN_BY_ID = Object.fromEntries(DOMAINS.map(d => [d.id, d]));

// --- Types de projet (nature du travail, plus visible que le domaine sur la carte). ---
const TYPES = [
  { id: 'achat',          label: 'Achat',                    short: 'ACH', color: '#0369a1' },
  { id: 'etude',          label: 'Étude',                    short: 'ETU', color: '#15803d' },
  { id: 'evolution_tma',  label: 'Evolution - TMA',          short: 'EVO', color: '#0d9488' },
  { id: 'obsolescence',   label: 'Gestion d’obsolescence',   short: 'OBS', color: '#b45309' },
  { id: 'mise_en_oeuvre', label: 'Mise en œuvre',            short: 'MEP', color: '#4338ca' },
  { id: 'tma_corrective', label: 'TMA Corrective',           short: 'TMA', color: '#7c3aed' },
];
const TYPE_BY_ID = Object.fromEntries(TYPES.map(t => [t.id, t]));

const COLUMN_BY_ID = Object.fromEntries(COLUMNS.map(c => [c.id, c]));
const LANE_BY_ID   = Object.fromEntries(SWIMLANES.map(l => [l.id, l]));

// --- Quality gates. Not enforced in software (P-gates are human decisions at governance). ---
const GATES = {
  prets: { code: 'DoR', label: 'Definition of Ready', color: '#1d4ed8' },
  done:  { code: 'DoD', label: 'Definition of Done',  color: '#047857' },
};

// --- Time is the hidden dimension (P7). The eye must read age without clicking. ---
const AGE = {
  fresh:  { max: 7,        label: 'Frais' },
  recent: { max: 28,       label: 'Récent' },
  aging:  { max: 60,       label: 'Vieillit' },
  stale:  { max: Infinity, label: 'Stagnant' },
};

// Returns 'fresh' | 'recent' | 'aging' | 'stale' for a day count.
function ageCategory(days) {
  if (days <= AGE.fresh.max) return 'fresh';
  if (days <= AGE.recent.max) return 'recent';
  if (days <= AGE.aging.max) return 'aging';
  return 'stale';
}

// Black-overlay alpha for stagnation. Deliberately silent for fresh/recent cards
// (<= 28j): the age text carries the fine grain; the background only speaks when
// a subject is actually stagnating, so the board stays calm.
function decayAlpha(days) {
  if (days <= 28) return 0;
  if (days <= 60) return 0.12 + (days - 28) / 32 * 0.18;  // vieillit : 0.12 -> 0.30
  return Math.min(0.45, 0.30 + (days - 60) / 90 * 0.15);  // stagnant : 0.30 -> 0.45
}

// Human-readable short age, e.g. "3j", "2s", "4m".
function ageLabel(days) {
  if (days < 14) return days + 'j';
  if (days < 60) return Math.round(days / 7) + 's';
  return Math.round(days / 30) + 'm';
}

const CRITICALITY = {
  top:    { label: 'Top',    badge: 'TOP',   bg: '#eab308', fg: '#1a1505' },
  major:  { label: 'Major',  badge: 'MAJOR', bg: '#475569', fg: '#e2e8f0' },
  normal: { label: 'Normal', badge: null },
};

const NATURE = {
  simple:      { label: 'Clair',     bg: '#ccfbf1', fg: '#0d9488' },
  complicated: { label: 'Compliqué', bg: '#dbeafe', fg: '#2563eb' },
  complex:     { label: 'Complexe',  bg: '#ffedd5', fg: '#c2410c' },
};

// --- Configurability (Season 2 admin panel, pulled forward) ---
// The defaults above ARE the NMO model. An admin can reorder/rename/extend them;
// the running config is applied onto window globals so every component reads it.
const GATE_DEFS = {
  DoR: { label: 'Definition of Ready', color: '#1d4ed8' },
  DoD: { label: 'Definition of Done',  color: '#047857' },
};

// Immutable snapshot of the NMO model, taken BEFORE any applyBoardConfig call.
const BOARD_DEFAULTS_JSON = JSON.stringify({
  columns: COLUMNS, lanes: SWIMLANES, domains: DOMAINS, types: TYPES,
  natures: NATURE, crits: CRITICALITY, fields: [],
});

function defaultBoardConfig() {
  // Parse from the load-time snapshot — NOT the live globals. Babel-standalone
  // hoists top-level consts onto window, so COLUMNS === window.COLUMNS and
  // applyBoardConfig() would otherwise overwrite what we read here.
  return JSON.parse(BOARD_DEFAULTS_JSON);
}

// Push a config onto the globals all components read. Caller re-renders after.
function applyBoardConfig(cfg) {
  window.COLUMNS = cfg.columns;
  window.SWIMLANES = cfg.lanes;
  window.DOMAINS = cfg.domains;
  window.TYPES = cfg.types || TYPES;
  window.NATURE = cfg.natures;
  window.CRITICALITY = cfg.crits;
  window.FIELDS = cfg.fields || [];
  window.DOMAIN_BY_ID = Object.fromEntries(cfg.domains.map(d => [d.id, d]));
  window.TYPE_BY_ID = Object.fromEntries((cfg.types || TYPES).map(t => [t.id, t]));
  window.COLUMN_BY_ID = Object.fromEntries(cfg.columns.map(c => [c.id, c]));
  window.LANE_BY_ID = Object.fromEntries(cfg.lanes.map(l => [l.id, l]));
  window.GATES = Object.fromEntries(cfg.columns.filter(c => c.gate).map(c => [c.id, { code: c.gate, ...GATE_DEFS[c.gate] }]));
}

Object.assign(window, {
  COLUMNS, SWIMLANES, DOMAINS, DOMAIN_BY_ID, TYPES, TYPE_BY_ID, COLUMN_BY_ID, LANE_BY_ID,
  GATES, AGE, CRITICALITY, NATURE, ageCategory, decayAlpha, ageLabel,
  GATE_DEFS, defaultBoardConfig, applyBoardConfig, FIELDS: [],
});
