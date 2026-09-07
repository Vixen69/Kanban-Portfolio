# ADR 022 — Sous-domaines et vocabulaire Orga (types et domaines retenus)

## Contexte

- Retours PMO du 2026-09-04 (révision datée en tête de
  `docs/IMPORT-MAPPING.md`, R3, R4, R10) : le périmètre 2026 ne retient que
  **quatre types** de projet, et le domaine des cartes est celui du
  vocabulaire **« Domaine (Orga) »** du classeur de consolidation — dix
  valeurs — et non plus les neuf « RDOM » de la première config ni les
  portefeuilles.
- Le PMO veut lire le portefeuille **par sous-domaine** pour deux domaines
  seulement, **A&D** et **CORPORATE** (les sous-domaines existent partout
  dans les exports, mais sont repliés dans leur domaine ailleurs) — et les
  sélectionner directement dans la barre de filtres, en dépliant le domaine.
- Contrainte produit inchangée : seule la topologie/le vocabulaire est
  configurable (CLAUDE.md §1, ADR 013) ; les filtres estompent, ne retirent
  jamais (ADR 005) ; le journal fait foi (ADR 002).

## Décision

- **Le sous-domaine est une notion de vocabulaire hiérarchique, optionnelle
  par domaine.** `Domain.subDomains?: { id, name }[]` dans la config
  (`core/config-types.ts`) : déclaré uniquement sur les domaines que le PMO
  détaille ; absent ailleurs. Validation : tableau non vide quand présent,
  ids uniques dans le domaine (`core/config-vocab.ts`).
- **La carte porte `subDomain: string | null`** — l'id d'un sous-domaine de
  son domaine, `null` quand le domaine n'est pas détaillé ou que la carte
  n'en a pas (« CORPORATE, non détaillé » est légitime, comme dans la table
  PARAM). Champ éditable (`CardPatch`, journal `edited`), validé côté
  middle contre les sous-domaines déclarés ; à la lecture,
  `reconcileCardRefs` ne conserve un sous-domaine que si son domaine
  (éventuellement remappé) le déclare encore — **un sous-domaine ne survit
  jamais à son domaine**. Les instantanés stockés avant cette ADR se lisent
  avec `subDomain = null`.
- **Filtres** (`core/filters.ts`) : un groupe `subDomain` dont les clés
  sont préfixées par le domaine (`domaine/sous-domaine`). Une carte à
  sous-domaine doit passer son domaine ET son sous-domaine ; une carte sans
  suit son domaine seul. **Un domaine coché = tous ses sous-domaines** :
  basculer le pill du domaine aligne ses sous-domaines (`withDomainToggled`),
  tout/rien balaie les deux cartes (`withDomainsSet`).
- **Sidebar** : le groupe « Domaine » (ex-« Domaine RDOM ») garde un pill par
  domaine ; les domaines détaillés portent un **chevron à gauche** qui
  déplie une ligne de pills de sous-domaines. Un domaine allumé dont une
  partie des sous-domaines est éteinte s'affiche en pointillé
  (« partiel »). Le dépliage est un état de vue, jamais persisté.
- **Vocabulaire de la config par défaut** (`config/board.json`) : `domains`
  = A&D, CORPORATE, ERP, INDUSTRIE, INFRA, ING, IT4IT, PLM, SOUTIEN, SUPPORT
  OFFICE (libellés du client tels quels), sous-domaines déclarés sur A&D
  (4) et CORPORATE (9) ; `types` = Étude, Projet de gestion
  d’obsolescence, Projet de mise en œuvre, Projet IA. Le groupe « Type de
  projet » de la sidebar reste piloté par la config — il n'affiche donc
  plus que ces quatre.
- **Fiche et formulaire** : le sous-domaine s'affiche en tag après le
  domaine ; le formulaire propose un select « Sous-domaine » seulement quand
  le domaine choisi en déclare, et changer de domaine le remet à « non
  détaillé ».

## Conséquences

- Les fixtures (`adapters/fixtures`) passent au nouveau vocabulaire
  (répartitions 10 domaines / 4 types, somme 150) et sèment des
  sous-domaines par index de carte — sans consommer le flux aléatoire, la
  texture du portefeuille de démonstration est inchangée.
- Les tests des contrats d'import de juillet (`rdom`, `sp_total`,
  `projet`, `consolide`) lisent un **instantané figé** de l'ancienne config
  (`adapters/csv-import/test-board.legacy.json`) : ils restent verts sans
  être réécrits, en attendant leur retrait par la révision des contrats
  (IMPORT-MAPPING.md, R9). L'instantané disparaît avec eux.
- Le **panneau admin** n'édite pas encore les sous-domaines (les domaines
  y restent nom/couleur/code) : le sous-domaine se déclare dans
  `config/board.json`. Le panneau admin est de toute façon à reconcevoir
  (décision auteur du 2026-09-04) ; l'édition des sous-domaines fera partie
  de cette refonte.
- QuickAdd ne propose pas le sous-domaine (il entre en `null`) : il se
  renseigne dans la fiche. Les cartes importées le recevront de la colonne
  « Ss-Daine (Orga) » (R4) au module suivant.
- Aucune dépendance ajoutée ; aucun changement de stockage (les cartes sont
  du `jsonb`) ; les évènements `edited` peuvent désormais porter
  `subDomain`. Pipeline vert : typecheck, 463 tests, conventions.
