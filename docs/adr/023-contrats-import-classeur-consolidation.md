# ADR 023 — Contrats d'import du classeur de consolidation (PARAM, Projets, ProjetsJalons, SP)

## Contexte

- Retours PMO du 2026-09-04, consignés en révision datée d'`IMPORT-MAPPING.md`
  (R1–R10) : le PMO livre désormais un **classeur de consolidation** dont
  les onglets remplacent les exports bruts de juillet ; sa table `PARAM`
  rend la table `RDOM` composée à la main inutile ; les coûts affichés
  étaient pluriannuels alors que le tableau veut le 2026 ; la liste
  `projets` **est** le périmètre.
- Le moteur de l'adaptateur (décodage, CSV, contrats d'en-têtes, rapport,
  chargement `--charger`) avait été conçu pour absorber ce genre de
  révision : seuls les lecteurs et l'assemblage changent (ADR 021).
- Contraintes inchangées : aucun fichier client sur la machine de
  l'auteur (squelettes synthétiques), mode audit d'abord, rien d'ignoré en
  silence, aucune dépendance.

## Révision 2026-09-08 — contrat `ProjetsCdP`

L'export Projets d'août ne porte plus les Responsable ; le PMO livre un
fichier séparé (Id, Nom, Responsable 1→3) issu de la même liste. Nouveau
contrat `projets_cdp` (requis Id + Responsable 1), placé **après**
`projets` dans le registre : Projets.csv, qui porte aussi ces colonnes,
reste élu périmètre. Le chef de projet suit la règle R6 (premier Responsable
hors responsables de domaine de PARAM) et ne remplit que les cartes qui n'en
ont pas.

## Décision

- **Registre des contrats**, du plus spécifique au plus générique :
  `param` → `sp` → `projets_jalons` → `projets` → `ressources_pdc`. Le
  contrat `rdom` de juillet reste enregistré comme **contrat retiré** : un
  tel fichier est inventorié « contrat retiré — non lu », jamais parsé.
  `sp_total`, `consolide` et l'export brut `projet` disparaissent, absorbés
  par les nouveaux contrats.
- **`projets` couvre les deux formes** du fichier (R4) : reconnu par
  Id + Nom + Type + État du processus — présents dans l'onglet consolidé
  comme dans l'export brut Sciforma, absents d'un vieux SP_total, qui ne
  peut donc plus se faire prendre pour le périmètre. La présence de
  « Domaine (Orga) » décide du chemin : lecture directe, sinon traduction
  du chemin d'organisation par `PARAM`.
- **`sp` couvre SP_2026 et SP_total** : Nom + les trois coûts requis, Id
  optionnel ; jointure par Id, puis nom, puis code PE embarqué dans le nom.
  Les **montants en euros sont convertis en k€** (l'unité écrite dans la
  cellule fait foi ; k€ ou sans unité pris tels quels), chaque conversion
  signalée.
- **`PARAM`** : quatre tables côte à côte sur un onglet ; le lecteur
  repère DOMAINES et ORGANISATION par leurs en-têtes de ligne 2 et lit le
  chemin d'organisation dans la colonne **sans en-tête** à gauche de
  « Domaine (Orga) » (mise en page du PMO). Les responsables de domaine
  sont compilés en listes de mots : un Responsable de projet est exclu du
  chef de projet quand tous les mots d'un responsable de domaine
  apparaissent dans sa cellule (matricules et initiales ignorés, mots
  entiers seulement). Les noms ne quittent jamais la machine d'exécution.
- **Types et sous-domaines (ADR 022)** : le type se lit par liste blanche
  des quatre retenus, suffixe parenthésé retiré ; un type inconnu est
  questionné, la ligne reste (la liste du PMO fait foi). Le sous-domaine ne
  se résout que dans un domaine détaillé (A&D, CORPORATE) ; ailleurs il est
  replié dans le domaine et compté.
- **Position** (`projets_jalons`, R7) : dernier jalon franchi → ancres de
  configuration (RDR → dernière colonne, RDLI → activation, RDO → « etudes »
  ou qualification), sinon la colonne d'entrée ; « Prêts » n'est jamais
  dérivé. Une cellule « franchi » vaut franchi pour VRAI / oui / x / 1 / une
  date (future signalée), non franchi pour FAUX / non / 0 / vide ; les
  valeurs brutes sont relevées au rapport pour fermer Q21.
- **Statu quo dit** : RDLI et charges j.h restent lus dans `projets`
  (pluriannuels — Q22/Q23) et le rapport le rappelle dans la ligne
  « coûts 2026 (SP) ».

## Conséquences

- `rdom.ts`, `sp-total.ts`, `consolide.ts`, leurs tests, l'instantané
  `test-board.legacy.json` (ADR 022) et les anciens squelettes sont
  supprimés ; `domains.ts` reprend le résolveur tolérant et la logique de
  patronymes. Nouveaux squelettes synthétiques `fixtures/import/{PARAM,
  Projets, ProjetsJalons, SP_2026}.csv` (Ressources_PdC inchangé).
- Le rapport d'audit gagne un état d'assemblage par source (PARAM,
  périmètre, position, domaine, chef de projet, coûts 2026, plan de
  charge) et le statut d'inventaire « contrat retiré ».
- `EnrichedCard` porte `subDomainId` et `domainSource` ; le chargeur écrit
  `subDomain` sur la carte. Aucun changement de `core/`, du stockage ni du
  middle ; zéro dépendance.
- Vérifié : 429 tests (82 sur l'adaptateur), typecheck, conventions ; audit
  CLI et chargement `--charger` de bout en bout sur les squelettes.
- Reste à faire côté client : le premier passage réel verrouille les
  en-têtes de `PARAM` et `SP_2026` (structure reconstituée à partir
  d'en-têtes relevés, pas d'un fichier), la commande LibreOffice du RUNBOOK
  et le relevé Q21.
