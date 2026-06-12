// data.jsx
// Deterministic generator for the 100-subject portfolio (Section 9 of the spec).
// Seeded so every reload produces the same board; user edits are then persisted
// to localStorage (Sprint 0 = prototype-grade persistence).

// Small seeded PRNG (mulberry32) — keeps the fake portfolio stable.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Generic enterprise / industrial IT subject names (no sector-specific references).
const SUBJECT_NAMES = [
  'Refonte ERP Finance', 'Migration Active Directory', 'Plateforme données analytics',
  'Portail fournisseurs B2B', 'Détection menaces endpoint', 'Automatisation tests CI/CD',
  'Jumeau numérique production', 'GMAO nouvelle génération', 'Conformité RGPD phase 2',
  'Migration PLM Windchill', 'Refonte nomenclatures', 'SSO fédéré multi-sites',
  'Dashboard pilotage industriel', 'Décommission legacy paie', 'Intégration MES montage',
  'Sécurisation accès sites', 'Migration SAP S/4HANA', 'Outil gestion configurations',
  'Refonte intranet collaboratif', 'Migration messagerie M365', 'Socle data lake industriel',
  'CRM unifié commercial', 'Portail RH self-service', 'Supervision réseau unifiée',
  'Sauvegarde et PRA datacenter', 'Virtualisation postes de travail', 'Refonte annuaire entreprise',
  'API gateway interne', 'Refonte facturation clients', 'Gestion électronique documents',
  'Dématérialisation factures', 'Portail e-commerce B2B', 'Modernisation WMS entrepôt',
  'Refonte référentiel articles', 'Plateforme IoT capteurs usine', 'Migration téléphonie ToIP',
  'Refonte poste opérateur', 'Outil planification capacité', 'Tableau de bord qualité',
  'Traçabilité produits série', 'Refonte gestion stocks', 'Portail partenaires logistique',
  'Migration base RH', 'Refonte processus achats', 'Catalogue services IT',
  'Automatisation provisioning', 'Refonte sécurité périmétrique', 'Chiffrement postes nomades',
  'Gestion des identités IAM', 'Refonte parc applicatif', 'Migration cloud privé',
  'Conteneurisation applications', 'Observabilité applicative', 'Refonte data warehouse',
  'Pilotage énergétique sites', 'Maintenance prédictive machines', 'Refonte configurateur produit',
  'Portail formation interne', 'Gestion notes de frais', 'Refonte signature électronique',
  'Modernisation GED qualité', 'Plateforme collaboration projet', 'Refonte gestion contrats',
  'Outil suivi budgétaire', 'Refonte reporting financier', 'Migration outil ticketing',
  'Refonte service desk', 'Cartographie applicative', 'Plan continuité activité',
  'Refonte accès physiques', 'Modernisation supervision usine', 'Refonte flux EDI',
  'Intégration paie-RH', 'Refonte gestion temps', 'Portail mobilité salariés',
  'Refonte immobilisations', 'Outil prévision ventes', 'Refonte tarification',
  'Plateforme API partenaires', 'Refonte qualité fournisseurs', 'Migration PLM CAO',
  'Refonte gestion projets', 'Modernisation poste industriel', 'Refonte gestion incidents',
  'Outil gestion changements', 'Refonte référentiel clients', 'Plateforme données produit',
  'Refonte gestion expéditions', 'Migration outil BI', 'Refonte cockpit direction',
  'Outil gestion risques', 'Refonte onboarding', 'Modernisation réseau usine',
  'Refonte habilitations', 'Plateforme e-learning', 'Refonte gestion flotte',
  'Outil pilotage maintenance', 'Refonte gestion documentaire', 'Migration ERP RH',
  'Refonte portail client', 'Outil gestion litiges', 'Refonte gestion garanties',
  'Plateforme self BI', 'Refonte gestion commandes', 'Modernisation WiFi sites',
  'Refonte gestion fournisseurs', 'Capacity planning IT', 'Refonte sauvegarde cloud',
  'Plateforme MDM données', 'Refonte gestion actifs IT',
  // --- 50+ subjects supplémentaires (criticité normale) ---
  'Refonte portail intranet RH', 'Migration serveurs de fichiers', 'Outil réservation salles',
  'Refonte gestion congés', 'Modernisation parc imprimantes', 'Refonte annuaire fournisseurs',
  'Portail déclaration incidents', 'Refonte gestion badges', 'Outil suivi formations',
  'Migration outil sondages', 'Refonte gestion plannings', 'Plateforme covoiturage interne',
  'Refonte signalétique numérique', 'Outil gestion prêt matériel', 'Refonte FAQ support',
  'Migration wiki technique', 'Refonte gestion astreintes', 'Outil suivi consommables',
  'Refonte gestion visiteurs', 'Modernisation bornes accueil', 'Refonte catalogue formations',
  'Outil enquêtes satisfaction', 'Refonte gestion clés', 'Migration espace documentaire',
  'Refonte gestion véhicules', 'Outil suivi audits internes', 'Refonte affichage dynamique',
  'Plateforme idéation interne', 'Refonte gestion EPI', 'Outil planification réunions',
  'Refonte gestion abonnements', 'Migration outil notes internes', 'Refonte tableau affichage',
  'Outil gestion cartes accès', 'Refonte gestion fournitures', 'Modernisation salle serveurs',
  'Refonte gestion licences', 'Outil suivi demandes IT', 'Refonte gestion sauvegardes postes',
  'Migration outil glossaire', 'Refonte gestion annuaire interne', 'Outil suivi présences',
  'Refonte gestion parc mobile', 'Plateforme partage bonnes pratiques', 'Refonte gestion réservations',
  'Outil cartographie process', 'Refonte gestion accès VPN', 'Migration outil organigramme',
  'Refonte gestion comptes service', 'Outil suivi non-conformités',
];

// Plans de charge réalistes (étiquette courte).
const PLAN_CHARGE = ['1 ETP', '0,5 ETP', '2 ETP', '1,5 ETP', '3 ETP', '0,8 ETP', 'Équipe mutualisée'];

// Ressources clés (rôles / équipes engagés).
const RESSOURCES = [
  'Architecte DAAT', 'Équipe Infra', 'Référent métier', 'DevOps', 'DBA', 'Infogérant',
  'Expert sécurité', 'Intégrateur', 'Lead dev', 'Product owner', 'Équipe réseau', 'Support N3',
];

// Commentaires de suivi (contexte de conversation au Portfolio Sync).
const COMMENTS = [
  'Point d’avancement présenté en COPROJ.',
  'Estimation revue à la hausse après cadrage.',
  'Dépendance identifiée avec un autre sujet.',
  'Jalon clé tenu, suite au planning.',
  'En attente de confirmation du sponsor.',
  'Périmètre ajusté avec le métier.',
  'Risque planning signalé à surveiller.',
  'Recette en cours côté métier.',
];

const CP_NAMES = [
  'M. Bernard', 'Mme Lefèvre', 'M. Garnier', 'Mme Moreau', 'M. Dubois', 'Mme Laurent',
  'M. Rousseau', 'Mme Girard', 'M. Mercier', 'Mme Bonnet', 'M. Faure', 'Mme Chevalier',
  'M. Robin', 'Mme Dumont', 'M. Lemoine', 'Mme Renaud', 'M. Marchand', 'Mme Aubert',
  'M. Perrot', 'Mme Roy', 'M. Gauthier', 'Mme Colin', 'M. Vidal', 'Mme Léger', 'M. Brun',
];

const BLOCK_REASONS = [
  'En attente d’arbitrage budgétaire',
  'Dépendance équipe Infra non livrée',
  'Attente validation architecture (DAAT)',
  'Ressource clé indisponible',
  'Attente décision COPROJ',
  'Blocage fournisseur externe',
  'Conflit de priorité avec un autre sujet',
  'Attente créneau infogérant',
  'Spécifications incomplètes',
  'Attente retour métier',
];

// Day-in-column ranges per stage — active/study stages skew older (P7).
const AGE_PROFILE = {
  demandes:      [1, 22],
  qualification: [4, 48],
  etudes:        [18, 95],
  prets:         [1, 26],
  actifs:        [12, 130],
  done:          [3, 28],
  exploitation:  [8, 80],
};

function generateCards() {
  const rng = mulberry32(20260609);
  const rand = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const fill = (val, n) => Array(n).fill(val);
  const now0 = Date.now();

  // 1) canal + criticality. 150 sujets : base Section 9 (100) + 50 sujets normaux.
  const specs = [];
  const NATURE_BY_CANAL = { projets: 'complicated', petits_projets: 'simple', projets_complexes: 'complex' };
  function addCanal(canal, tops, majors, normals) {
    const total = tops + majors + normals;
    const crit = shuffle([...fill('top', tops), ...fill('major', majors), ...fill('normal', normals)]);
    for (let i = 0; i < total; i++) specs.push({ canal, criticality: crit[i], nature: NATURE_BY_CANAL[canal] });
  }
  addCanal('projets', 7, 14, 29);
  addCanal('petits_projets', 1, 8, 51);
  addCanal('projets_complexes', 2, 8, 30);

  const cards = shuffle(specs);

  // 2) columns, rdom, names — exact totals (150), assigned independently.
  const cols = shuffle([
    ...fill('demandes', 23), ...fill('qualification', 18), ...fill('etudes', 27),
    ...fill('prets', 12), ...fill('actifs', 37), ...fill('done', 15), ...fill('exploitation', 18),
  ]);
  const rdoms = shuffle([
    ...fill('ingenierie', 23), ...fill('soutien', 15), ...fill('industrie', 15),
    ...fill('corporate', 21), ...fill('erp', 18), ...fill('plm', 15),
    ...fill('infra', 18), ...fill('archi_dev', 15), ...fill('cyber', 10),
  ]);
  const names = shuffle(SUBJECT_NAMES);
  // Type de projet — distribution réaliste sur les 150 sujets.
  const types = shuffle([
    ...fill('mise_en_oeuvre', 40), ...fill('evolution_tma', 35), ...fill('etude', 25),
    ...fill('obsolescence', 20), ...fill('tma_corrective', 18), ...fill('achat', 12),
  ]);

  // Consumed ratio by stage: nothing consumed before Actifs; ramps through delivery.
  const CONSUMED_RATIO = {
    demandes: [0, 0], qualification: [0, 0.05], etudes: [0, 0.12], prets: [0, 0.05],
    actifs: [0.15, 0.85], done: [0.85, 1.1], exploitation: [0.9, 1.15],
  };

  cards.forEach((c, i) => {
    c.id = 'S' + String(i + 1).padStart(3, '0');
    c.column = cols[i];
    c.rdom = rdoms[i];
    c.name = names[i] || (names[i % names.length] + ' (lot ' + (Math.floor(i / names.length) + 1) + ')');
    c.cp = pick(CP_NAMES);
    c.notes = '';
    c.blocked = false;
    c.blockReason = '';
    c.sciformaId = rng() < 0.72 ? 'SCF-' + rand(1000, 9999) : null;
    c.type = types[i];
    // Code projet (codename), ex. PX4520155 — recherchable, masquable.
    c.codename = 'PX' + String(rand(1000000, 9999999));
    // Meilleur estimé (jours-homme), échelle selon le canal.
    const estBand = c.canal === 'petits_projets' ? [10, 60] : c.canal === 'projets' ? [60, 320] : [40, 260];
    c.estime = rand(estBand[0], estBand[1]);
    // Consommé dérivé du stade (avec dérive possible en livraison).
    const [lo, hi] = CONSUMED_RATIO[c.column] || [0, 0];
    c.consomme = Math.round(c.estime * (lo + rng() * (hi - lo)));
    // Budget (k€) corrélé à la charge : ~0,5–0,9 k€ par jour-homme.
    c.estimeBudget = Math.round(c.estime * (0.5 + rng() * 0.4));
    c.consommeBudget = c.estime ? Math.round(c.estimeBudget * (c.consomme / c.estime)) : 0;
    c.planCharge = pick(PLAN_CHARGE);
    // 1 à 3 ressources clés distinctes.
    c.ressources = shuffle(RESSOURCES).slice(0, rand(1, 3));
    // 0 à 2 commentaires de suivi.
    c.commentaires = shuffle(COMMENTS).slice(0, rand(0, 2)).map((text, k) => ({
      user: pick(CP_NAMES), at: new Date(now0 - rand(1, 40) * 86400000).toISOString(), text,
    }));
  });

  // 3) blocked — counts scaled up with the larger portfolio.
  function block(column, n) {
    const pool = shuffle(cards.filter(c => c.column === column));
    for (let i = 0; i < n && i < pool.length; i++) {
      pool[i].blocked = true;
      pool[i].blockReason = pick(BLOCK_REASONS);
    }
  }
  block('qualification', 3); block('etudes', 4); block('actifs', 9); block('done', 2);

  // 4) age + movement history. Build a plausible path from Demandes up to the
  //    current column so flow metrics (temps par étape, lead time) are real.
  const ORDER = ['demandes', 'qualification', 'etudes', 'prets', 'actifs', 'done', 'exploitation'];
  const STEP_DAYS = { demandes: [2, 18], qualification: [3, 20], etudes: [10, 45], prets: [1, 14], actifs: [15, 70], done: [3, 16], exploitation: [10, 60] };
  cards.forEach((c) => {
    const [lo, hi] = AGE_PROFILE[c.column];
    let days = rand(lo, hi);
    if (c.blocked) days = Math.max(days, rand(35, hi));
    const movedAt = new Date(now0 - days * 86400000).toISOString();
    c.movedAt = movedAt;
    // Reconstruct prior transitions backwards from current entry.
    const idx = ORDER.indexOf(c.column);
    const hist = [];
    let cursor = now0 - days * 86400000;
    for (let k = idx; k >= 1; k--) {
      const from = ORDER[k - 1], to = ORDER[k];
      hist.unshift({ from, to, at: new Date(cursor).toISOString(), user: k === idx ? pick(['vous', 'sciforma-sync']) : 'sciforma-sync' });
      const [sl, sh] = STEP_DAYS[from] || [3, 20];
      cursor -= rand(sl, sh) * 86400000;
    }
    hist.unshift({ from: null, to: 'demandes', at: new Date(cursor).toISOString(), user: 'sciforma-sync' });
    c.history = hist;
  });

  return cards;
}

// Days a card has sat in its current column (recomputed live from movedAt).
function daysInColumn(card) {
  return Math.max(0, Math.floor((Date.now() - new Date(card.movedAt).getTime()) / 86400000));
}

Object.assign(window, { generateCards, daysInColumn, CP_NAMES, BLOCK_REASONS });
