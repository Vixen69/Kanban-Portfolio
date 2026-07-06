// Synthetic dataset pools for the fixtures adapter — ported VERBATIM from
// design/data.jsx (the validated design v9 prototype). Generic enterprise /
// industrial IT vocabulary; no real client data, ever.

/**
 * Subject names (French, sector-neutral enterprise IT). 160 entries as in
 * the design; the generator shuffles the pool and draws the first 150.
 */
export const SUBJECT_NAMES = [
  "Refonte ERP Finance", "Migration Active Directory", "Plateforme données analytics",
  "Portail fournisseurs B2B", "Détection menaces endpoint", "Automatisation tests CI/CD",
  "Jumeau numérique production", "GMAO nouvelle génération", "Conformité RGPD phase 2",
  "Migration PLM Windchill", "Refonte nomenclatures", "SSO fédéré multi-sites",
  "Dashboard pilotage industriel", "Décommission legacy paie", "Intégration MES montage",
  "Sécurisation accès sites", "Migration SAP S/4HANA", "Outil gestion configurations",
  "Refonte intranet collaboratif", "Migration messagerie M365", "Socle data lake industriel",
  "CRM unifié commercial", "Portail RH self-service", "Supervision réseau unifiée",
  "Sauvegarde et PRA datacenter", "Virtualisation postes de travail", "Refonte annuaire entreprise",
  "API gateway interne", "Refonte facturation clients", "Gestion électronique documents",
  "Dématérialisation factures", "Portail e-commerce B2B", "Modernisation WMS entrepôt",
  "Refonte référentiel articles", "Plateforme IoT capteurs usine", "Migration téléphonie ToIP",
  "Refonte poste opérateur", "Outil planification capacité", "Tableau de bord qualité",
  "Traçabilité produits série", "Refonte gestion stocks", "Portail partenaires logistique",
  "Migration base RH", "Refonte processus achats", "Catalogue services IT",
  "Automatisation provisioning", "Refonte sécurité périmétrique", "Chiffrement postes nomades",
  "Gestion des identités IAM", "Refonte parc applicatif", "Migration cloud privé",
  "Conteneurisation applications", "Observabilité applicative", "Refonte data warehouse",
  "Pilotage énergétique sites", "Maintenance prédictive machines", "Refonte configurateur produit",
  "Portail formation interne", "Gestion notes de frais", "Refonte signature électronique",
  "Modernisation GED qualité", "Plateforme collaboration projet", "Refonte gestion contrats",
  "Outil suivi budgétaire", "Refonte reporting financier", "Migration outil ticketing",
  "Refonte service desk", "Cartographie applicative", "Plan continuité activité",
  "Refonte accès physiques", "Modernisation supervision usine", "Refonte flux EDI",
  "Intégration paie-RH", "Refonte gestion temps", "Portail mobilité salariés",
  "Refonte immobilisations", "Outil prévision ventes", "Refonte tarification",
  "Plateforme API partenaires", "Refonte qualité fournisseurs", "Migration PLM CAO",
  "Refonte gestion projets", "Modernisation poste industriel", "Refonte gestion incidents",
  "Outil gestion changements", "Refonte référentiel clients", "Plateforme données produit",
  "Refonte gestion expéditions", "Migration outil BI", "Refonte cockpit direction",
  "Outil gestion risques", "Refonte onboarding", "Modernisation réseau usine",
  "Refonte habilitations", "Plateforme e-learning", "Refonte gestion flotte",
  "Outil pilotage maintenance", "Refonte gestion documentaire", "Migration ERP RH",
  "Refonte portail client", "Outil gestion litiges", "Refonte gestion garanties",
  "Plateforme self BI", "Refonte gestion commandes", "Modernisation WiFi sites",
  "Refonte gestion fournisseurs", "Capacity planning IT", "Refonte sauvegarde cloud",
  "Plateforme MDM données", "Refonte gestion actifs IT", "Refonte portail intranet RH",
  "Migration serveurs de fichiers", "Outil réservation salles", "Refonte gestion congés",
  "Modernisation parc imprimantes", "Refonte annuaire fournisseurs", "Portail déclaration incidents",
  "Refonte gestion badges", "Outil suivi formations", "Migration outil sondages",
  "Refonte gestion plannings", "Plateforme covoiturage interne", "Refonte signalétique numérique",
  "Outil gestion prêt matériel", "Refonte FAQ support", "Migration wiki technique",
  "Refonte gestion astreintes", "Outil suivi consommables", "Refonte gestion visiteurs",
  "Modernisation bornes accueil", "Refonte catalogue formations", "Outil enquêtes satisfaction",
  "Refonte gestion clés", "Migration espace documentaire", "Refonte gestion véhicules",
  "Outil suivi audits internes", "Refonte affichage dynamique", "Plateforme idéation interne",
  "Refonte gestion EPI", "Outil planification réunions", "Refonte gestion abonnements",
  "Migration outil notes internes", "Refonte tableau affichage", "Outil gestion cartes accès",
  "Refonte gestion fournitures", "Modernisation salle serveurs", "Refonte gestion licences",
  "Outil suivi demandes IT", "Refonte gestion sauvegardes postes", "Migration outil glossaire",
  "Refonte gestion annuaire interne", "Outil suivi présences", "Refonte gestion parc mobile",
  "Plateforme partage bonnes pratiques", "Refonte gestion réservations", "Outil cartographie process",
  "Refonte gestion accès VPN", "Migration outil organigramme", "Refonte gestion comptes service",
  "Outil suivi non-conformités",
];

/** Plans de charge (short labels). */
export const PLAN_CHARGE = ["1 ETP", "0,5 ETP", "2 ETP", "1,5 ETP", "3 ETP", "0,8 ETP", "Équipe mutualisée"];

/** Ressources clés (roles / teams engaged on a subject). */
export const RESSOURCES = [
  "Architecte DAAT", "Équipe Infra", "Référent métier", "DevOps",
  "DBA", "Infogérant", "Expert sécurité", "Intégrateur",
  "Lead dev", "Product owner", "Équipe réseau", "Support N3",
];

/** Follow-up comments (Portfolio Sync conversation snippets). */
export const COMMENTS = [
  "Point d’avancement présenté en COPROJ.",
  "Estimation revue à la hausse après cadrage.",
  "Dépendance identifiée avec un autre sujet.",
  "Jalon clé tenu, suite au planning.",
  "En attente de confirmation du sponsor.",
  "Périmètre ajusté avec le métier.",
  "Risque planning signalé à surveiller.",
  "Recette en cours côté métier.",
];

/** Chefs de projet (synthetic French names) — card owners and comment authors. */
export const CP_NAMES = [
  "M. Bernard", "Mme Lefèvre", "M. Garnier", "Mme Moreau", "M. Dubois", "Mme Laurent",
  "M. Rousseau", "Mme Girard", "M. Mercier", "Mme Bonnet", "M. Faure", "Mme Chevalier",
  "M. Robin", "Mme Dumont", "M. Lemoine", "Mme Renaud", "M. Marchand", "Mme Aubert",
  "M. Perrot", "Mme Roy", "M. Gauthier", "Mme Colin", "M. Vidal", "Mme Léger",
  "M. Brun",
];

/** Reasons a subject gets blocked (shown on the card and in the detail). */
export const BLOCK_REASONS = [
  "En attente d’arbitrage budgétaire",
  "Dépendance équipe Infra non livrée",
  "Attente validation architecture (DAAT)",
  "Ressource clé indisponible",
  "Attente décision COPROJ",
  "Blocage fournisseur externe",
  "Conflit de priorité avec un autre sujet",
  "Attente créneau infogérant",
  "Spécifications incomplètes",
  "Attente retour métier",
];
