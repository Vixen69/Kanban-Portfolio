// Synthetic dataset pools for the fixtures adapter.
// Generic enterprise / industrial IT vocabulary — no real client data, ever.

/** Subject titles (French, sector-neutral enterprise IT). */
export const SUBJECT_TITLES = [
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
];

/** Card owners (synthetic French names). */
export const OWNERS = [
  "M. Bernard", "Mme Lefèvre", "M. Garnier", "Mme Moreau", "M. Dubois", "Mme Laurent",
  "M. Rousseau", "Mme Girard", "M. Mercier", "Mme Bonnet", "M. Faure", "Mme Chevalier",
  "M. Robin", "Mme Dumont", "M. Lemoine", "Mme Renaud", "M. Marchand", "Mme Aubert",
  "M. Perrot", "Mme Roy", "M. Gauthier", "Mme Colin", "M. Vidal", "Mme Léger", "M. Brun",
];

/** Reasons a subject gets blocked (shown on hover/focus of a blocked card). */
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

/** Free-form tags carried by cards. */
export const TAGS = [
  "sécurité", "migration", "data", "rgpd", "pilote", "budget-2026", "obsolescence",
  "fournisseur", "mvp", "infra", "audit", "quick-win",
];
