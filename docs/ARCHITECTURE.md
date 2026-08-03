# Architecture — journal des changements (suivi projet)

Registre vivant, en langage clair, des décisions et changements
d'architecture. Il **double** le suivi tenu dans le dépôt (ADR formels sous
`docs/adr/`, contrat `CLAUDE.md`) pour être recopié dans le projet Claude
(web) de suivi. Toute évolution d'architecture est ajoutée ici, datée, en plus
de son ADR.

## Architecture actuelle (en bref)

- **Produit** : instrument kanban de portefeuille. Opinion câblée en dur :
  flux tiré, vieillissement visible, blocages qui crient, un seul écran, le
  journal d'évènements fait foi. Seule la topologie est configurable
  (`config/board.json`).
- **Pattern** : ports & adaptateurs + **event-sourcing**. Le journal
  `card_events` est append-only — à la fois piste d'audit et source unique des
  métriques ; position, blocage et vieillissement sont **repliés à la lecture**,
  jamais stockés (ADR 002).
- **`core/`** : toute la logique métier en TypeScript pur — zéro dépendance,
  zéro React, zéro API Node. Portable et testé. C'est le cœur qui survit à tout
  changement de pile.
- **Cible (depuis le 2026-06-19)** : plateforme **conteneurisée** du client —
  front **React 18 / Vite**, middle **Node / Express**, back **PostgreSQL**,
  Docker. Authentification **JWT en cookie httpOnly** + **scrypt**.
  Dépendances bornées au **plafond SBOM** autorisé par le client.
- **Référence produit** : design **v11** (ADR 017/018/019) — archivage
  réversible, blocage gouverné (motif obligatoire), nature positionnelle
  (= canal), un clic ouvre la fiche, réordonnancement manuel — au-dessus de la
  v10 (risques / contraintes / contention / plan de charge, ADR 014) et de la
  v9 (ADR 012/013).
- **État live** : monorepo `core/` + `middle/` (Express, pilote **PostgreSQL**
  `pg` — défaut conteneur, JSONL en repli) + `front/` (React 18) ; **318 tests**
  `node:test` (dont les frontières d'architecture et le scanner de conventions).
  Lancement dev : `npm run serve` (middle :8787) + `npm run dev` (front :5173,
  proxy `/api`) ; données via `KANBAN_ALLOW_SEED=1 npm run seed`. Cf. README
  « Démarrer ».
- **Livraison** : conteneurisée (images front nginx + middle Express, même
  origine, **PostgreSQL** par défaut ; SBOM CycloneDX), ADR 015/016 —
  conteneurs durcis (en-têtes page + API, middle non-root, digests épinglés,
  ports loopback). Dossier `LIVRAISON.md` (construire / lancer / vérifier /
  test local Docker).

## Journal des changements

### Fondations — contrat initial
- Ports & adaptateurs : un port `PortfolioDataSource` (accès PPM en lecture).
- Event-sourcing posé comme socle (ADR 002) : journal append-only, état dérivé.
- ADR 001 (chaîne de build), 003 (fixtures déterministes), 004 (UI sans
  ressource distante), 005 (filtres : estomper, jamais retirer).
- Minimalisme radical : budget 1 dépendance runtime / 12 directes, `node:http`,
  SQLite, CSS écrit à la main, aucun framework.

### Sprints 1-2 — plateau, barre latérale, filtres
- Modèle de carte étendu pour coller à la maquette : criticité
  (top/major/normal), `type_id`, `codename`, `lane.nature` (ADR 006).
- Métriques anticipées (cycle time, débit, temps par colonne, vieillissement)
  calculées **exclusivement** depuis le journal ; édition par évènements
  (ADR 007).

### Sprint 3 — persistance + serveur + UI sur l'API *(réalisé, non commité)*
- **Port de stockage `BoardStorage`** au niveau dépôt — pilotes
  interchangeables, sélection explicite.
- **Pilote `node:sqlite`** (ADR 008) : schéma STRICT, triggers append-only,
  `seq` entier (ids `evt-<seq>`), WAL, migrations par `user_version`.
- **Pilote de repli JSONL** (ADR 009) : zéro dépendance, lisible, reprise sur
  écriture interrompue ; une suite de conformité commune prouve la parité des
  deux pilotes.
- **Serveur `node:http` + API** (ADR 010) : `GET /api/config`,
  `GET /api/board` (cartes de base + journal, repli côté client),
  `POST /api/events`. Le serveur est **autorité** sur id/horodatage/acteur ;
  en-têtes de sécurité, CSP, plafond de corps, service statique de `dist/`.
- **UI bascule sur l'API** : `ui/api.ts` = surface d'egress unique (URLs
  relatives) ; `useBoardStore` charge `/api/board` et replie ; `core/` ne
  dépend plus des adaptateurs.
- Sécurité : le chaînage de hachés (inviolabilité applicative) est **écarté** —
  l'intégrité repose sur le contrôle d'accès infrastructure. Authentification
  reportée.

### 2026-06-19 — Pivot de re-plateformage (mandat de la plateforme client)
- Le client définit la cible : pile **conteneurisée** React 18/Vite (front) +
  Node/Express/TS (middle) + PostgreSQL (back), dans son **plafond SBOM**.
- **Gouvernance** : l'outil est celui de l'auteur (pour l'équipe PMO) ; le
  référent technique ne gouverne que le plafond SBOM ; toutes les décisions
  internes appartiennent à l'auteur.
- **Décisions** : SBOM = plafond (pas obligation) ; middle **Express** ;
  **PostgreSQL via `pg`** ; modèle **event-sourcing conservé** ; **JWT en
  cookie httpOnly** + SameSite=Strict ; **scrypt** (node:crypto) ; `node:test`
  (+ Vitest plus tard si besoin) ; `core/` partagé via **workspace npm** ;
  CSS écrit à la main maintenant, Tailwind/Radix ensuite.
- **Ce qui survit intact** : tout `core/` (logique + tests), la logique d'API,
  le port `BoardStorage` (nouvel adaptateur Postgres), les écrans React
  (19→18). « On re-plateforme les bords, on garde le cœur. »
- Contraintes minimalistes initiales (budget deps, pas de framework, SQLite,
  CSS-main-uniquement) **retirées**, remplacées par le plafond SBOM.
- À faire autoriser par le référent : **`pg`** ; canal de livraison/registre.
- Documents réécrits : `CLAUDE.md`, `DEPENDENCIES.md`, `SECURITY.md`.

### 2026-06-22 — RP0 : fondations du re-plateformage *(réalisé, non commité)*
- **ADR 011** : décision de re-plateformage, ce qui survit / ce qui est
  supersédé (pile uniquement), carte de migration.
- **Monorepo workspace npm** : `core/` formalisé en paquet
  (`@portfolio-kanban/core`, zéro dépendance) ; racine `package.json` avec
  `"workspaces": ["core"]`. `front/` et `middle/` rejoindront le workspace
  quand ils seront créés (RP2 / RP1).
- **Squelette Docker** (`docker/`) : `compose.yaml` avec un **PostgreSQL de
  dev utilisable dès maintenant** (`docker compose up db`) + services
  front/middle sous profil `app` (gabarits, non constructibles avant
  RP1/RP2) ; `Dockerfile.middle` / `Dockerfile.front` (gabarits Node 22) ;
  `.env.example`. Non testé ici (pas de Docker dans l'environnement de dev).
- **Portabilité de `core/` confirmée** : zéro import React/Node dans le code
  source (seuls les tests utilisent `node:test`). Les 149 tests existants
  restent verts après la mise en workspace — le code éprouvé n'est pas touché.
- Choix de séquencement : les déplacements `ui/`→`front/`, `server/`→`middle/`
  et l'installation des dépendances par étage se font **avec** la réécriture
  (RP1/RP2), pas dans RP0, pour ne pas casser le code éprouvé.

### 2026-06-22 — RP1 : middle sur Express *(réalisé, non commité)*
- **`server/` (node:http) migré en `middle/` (Express 5 + TS)**, dans le
  workspace npm. La logique d'API (`api.ts` : validation, fold,
  construction d'évènements, garde même-cellule, liste blanche d'édition)
  est **reprise inchangée** — transport-agnostique ; seul `app.ts`
  (Express) remplace `http.ts` (node:http). En-têtes de sécurité, plafond
  de corps 64 Kio, même origine (pas de CORS), `x-powered-by` désactivé,
  journalisation par ids.
- **Stockage** : pilote **JSONL** derrière le port `BoardStorage` (Node-22
  OK). **`node:sqlite` retiré** (incompatible Node 22) ; `static.ts` retiré
  (le front sera servi par son propre conteneur). `select.ts` : `jsonl`
  disponible, `postgres` réservé (throw tant que `pg` n'est pas autorisé).
- **Adaptateur PostgreSQL (`pg`) reporté** : `pg` reste à autoriser par le
  référent (ADR 011). Il se branchera derrière le même port — un fichier
  isolé, sans recâblage.
- Outillage : `tsconfig` propre au middle (nodenext, esModuleInterop) ;
  Node ciblé 22 ; lancé en dev par `node middle/main.ts`. `serve`, glob de
  tests, conventions, `seed` repointés sur `middle/`.
- **Vérifié bout-en-bout** : 130 tests verts (dont l'intégration Express) ;
  middle live (curl) ; et le front construit, via `vite preview` + proxy,
  rend les 113 cartes servies par le middle Express et un POST y aboutit
  (acteur « anonymous »). Le blanc observé sur le serveur **dev** Vite était
  une boucle de rechargement HMR après le changement de lockfile — pas le
  code (le build de prod est propre).

### 2026-06-22 — RP2 : front sur React 18 *(réalisé, non commité)*
- **`ui/` migré en `front/`** (workspace npm), au-dessus de `core/` inchangé.
  Descente aux versions autorisées du SBOM : **React 19→18.3**, **Vite
  8→7**, `@vitejs/plugin-react` 6→4, **TypeScript 6→5.9** (racine, middle et
  front alignés sur 5.9). CSS écrit à la main conservé ; Tailwind/Radix
  plus tard.
- Aucune API React-19 utilisée (vérifié) ; seul ajustement de code : les
  types de `ref` d'input (`RefObject<HTMLInputElement | null>` →
  `RefObject<HTMLInputElement>`), React 18 étant plus strict.
- `vite.config.ts` déplacé dans `front/` (build vers `front/dist`, proxy
  `/api` → middle 8787 en dev et en preview). Racine devenue gestionnaire de
  workspace : `dev`/`build`/`preview` délèguent au workspace `front` ; pas de
  React/Vite à la racine. `.nvmrc` → 22 (cible plateforme).
- **Vérifié bout-en-bout** : 130 tests verts ; build front sous **TS 5.9 +
  Vite 7** (52 modules, bundle 191 Ko vs 240 Ko en React 19) ; et via
  `vite preview` + proxy, le front React 18 rend les 113 cartes servies par
  le middle Express, un POST y aboutit (acteur « anonymous »), zéro erreur
  console.

### 2026-06-22 — Évolutivité & vérifiabilité (hors phase RP)
- **Test de frontières d'architecture** (`scripts/architecture.test.ts`, dans
  `npm test`) : 5 règles qui *suivent* les frontières et échouent si un import
  les franchit — `core/` pur (imports `./` uniquement, ni React/Node/
  framework) ; egress réseau confiné à `front/api.ts` ; le front ne touche
  jamais `middle/`/`adapters/`/`storage` (uniquement par HTTP) ; `middle/`
  sans React ni `front/` ; `pg` importé nulle part (différé, ADR 011). Rend
  la couche présentation librement modifiable *en sécurité* (une frontière
  franchie par erreur casse le test) et l'architecture vérifiable en une
  commande par le référent technique.
- **`front/interactions.ts` scindé** en `front/interactions/` par
  préoccupation — `view.ts` (modes + raccourcis), `cells.ts` (focus, repli,
  survol, détail), `movement.ts` (déplacement + navigation clavier),
  `state.ts` (horloge, bascules) + un baril `index.ts`. Comportement
  inchangé ; « comment ça s'ouvre/se déplace/s'affiche » est désormais
  localisé dans des unités courtes et lisibles. Vérifié : 135 tests,
  build, rendu + bascule de mode au clavier via preview.

### 2026-06-22 — Documentation de continuité (hors phase RP)
- Audit « session vierge » des docs. Le savoir (CLAUDE.md, ADR 001-011,
  ce journal + mémoire) était exact ; le **runbook** était cassé/périmé.
  Corrigé : `verify.sh` (cible `front/dist/index.html`, plus de vendoring
  hors-ligne) ; **README** réécrit (lancement deux-processus serve+dev,
  Node 22, seed `KANBAN_ALLOW_SEED`, variables d'env du middle, dépannage
  tableau vide) ; **vendoring retiré** (`scripts/vendor.ts`, `vendor/`, script
  npm — livraison par image conteneur, ADR 011) ; en-têtes Docker corrigés
  (front/ et middle/ existent ; middle pas encore constructible — pas de
  script `build`, RP6).

### 2026-07-06 — Reconstruction fidèle au design v9 (« the true version »)
- La maquette validée (`design/`, « Portefeuille DSI — Kanban NMO » v9) devient
  **la référence produit** (bannière datée dans CLAUDE.md ; ADR 012 modèle
  complet, ADR 013 configuration à chaud). Reconstruction sur les trois
  couches, orchestrée en deux workflows multi-agents (14 agents
  d'implémentation + 2 portes d'intégration + revue adversariale).
- **Contrats v2** : `config/board.json` (8 colonnes avec WIP actifs, gates
  DoR/DoD, notes, colonne « Pause » repliée par défaut ; canaux nature+détail ;
  domaines et types colorés ; natures/criticités renommables ; champs
  personnalisés ; seuils d'âge frais/récent/vieillit/stagnant 7/28/60) ;
  `core/types.ts` (carte complète : nature par carte, charge j.h, budget k€,
  plan de charge, ressources, notes, sciformaId, custom ; événements
  `commented`/`deleted` ; source `manual`).
- **core/** réécrit et testé sur le modèle v2 (fold avec commentaires,
  suppression par événement, patch étendu ; wipState na/ok/warn/over ;
  gabarits de grille focus/repli ; métriques de flux portées de la maquette).
  **middle/** : `POST /api/cards` (intake, id S-suivant + codename serveur),
  événements étendus, `PUT /api/config` + `GET /api/config/default` (surcharge
  `data/config.json` + historique append-only `data/config-history.jsonl`) ;
  port `BoardStorage.insertCard` ; en-tête JSONL v2 (rejet des données
  pré-v9). **fixtures** : générateur 150 sujets porté à l'identique (seed
  20260609), historique émis en événements (seed = 150 cartes, 768 évts).
- **front/** reconstruit 1:1 sur les modules de la maquette (CSS portée
  verbatim en 8 fichiers sous `front/styles/` ; polices DM Sans/DM Serif
  Display **auto-hébergées** (`front/public/fonts/`, OFL) — zéro egress ;
  valeurs tweaks validées figées : densité 16 px, pulse, barre domaine,
  fond neutre, pas d'assombrissement d'âge). Panneau admin (⚙, 3 onglets),
  fiche complète (charge/budget/ressources/commentaires/historique/
  suppression), QuickAdd, métriques (☷), état vide, raccourcis / N S Esc.
- **Vérifié** : 253 tests verts (porte finale sans aucun correctif) ;
  typecheck 3 tsconfigs ; conventions ; build (JS 206 Ko — 63 gzip, CSS
  24,7 Ko) ; **en navigateur à 1920×1080** : 150 cartes zéro défilement,
  focus 2.6fr, replis, fiche (commentaire→`evt commented`, blocage/levée,
  édition, suppression→`evt deleted`), QuickAdd (S151 créé puis supprimé —
  le journal garde tout), admin appliquer/réinitialiser (historisé, 2
  lignes), métriques (goulot = Actifs), recherche estompante (16/150),
  drag & drop (`evt-774 moved demandes→qualification`), zéro erreur console.
  Correctif découvert en vérification : proxy Vite `^/api/` (un préfixe nu
  `/api` capturait la requête du module `/api.ts` → 404).
- Accès simple : **« Lancer le tableau.cmd »** (double-clic : install si
  besoin + seed + middle + front + navigateur) ; README réaligné v9.
- ⚠ Arbitrages PO en attente : la maquette v9 n'affiche pas de marqueur
  d'escalade Andon (seuil conservé en core, ADR 012) ; `fitsOneScreen`
  littéral impossible avec la graine (cellule projets×actifs à 19 barres →
  écrêtage fidèle au design, test d'acceptation ajusté en conséquence) ;
  ré-exporter le design si une version postérieure au 11/06 a été validée.

### 2026-07-06 — Correctifs de la revue adversariale v9

- **Remap d'affichage côté plateau** : les cartes dont le canal/la colonne a
  été supprimé par une édition admin restent visibles (App applique
  `reconcileCardRefs` à toutes les cartes avant placement — affichage
  seulement, jamais d'évènement ; grid, compteurs et modales voient la même
  liste). Corrige la disparition silencieuse de cartes (invariant « tout le
  portefeuille visible »).
- **Intake atomique** : le port `BoardStorage.insertCard(card, created)`
  écrit la carte ET son évènement `created` en un seul lot (une carte ne
  peut plus exister sans trace d'audit) ; `middle/cards.ts` et le pilote
  JSONL adaptés, suite de conformance mise à jour.
- **config-store** : la ligne d'historique append-only est écrite AVANT la
  surcharge (un échec entre les deux laisse au pire une entrée d'historique
  en trop, jamais une surcharge active non auditée).
- **Échecs d'écriture visibles** : le store expose `lastError` (bandeau
  d'erreur dans le shell) ; `saveEdit` s'arrête au premier intent refusé ;
  le panneau admin reste ouvert sur un « Appliquer » refusé et affiche le
  message français du serveur ; « Réinitialiser le modèle » passe par
  `store.resetConfig` (re-télécharge les défauts si le fetch initial a
  échoué). Édition d'une carte bloquée : un changement de raison seul poste
  un intent `blocked` (la raison n'est plus perdue ; `blockedSince` se
  réinitialise alors — assumé).
- **Fidélité** : ✕ et clic-overlay du formulaire d'édition ferment toute la
  modale (design) ; « Annuler » seul revient à la fiche. Générateur de
  fixtures réaligné au prototype (tirage RNG « acteur » consommé : les âges
  par carte correspondent aux 150 cartes de la maquette ; test de régression
  S002 + assertion des bandes AGE_PROFILE). Tables de distribution extraites
  dans `adapters/fixtures/distributions.ts`.
- **Outillage/tests** : le vérificateur de conventions voit désormais les
  fonctions anonymes (`=> {` en fin de ligne) ; tests ajoutés : move validé
  contre l'état foldé post-move (rejet même-cellule), move canal-seul,
  non-réutilisation d'un id supprimé ; `detailId` orphelin nettoyé par
  effet. 259 tests verts.

### 2026-07-07 — Import du design v10 : couche risques / contraintes / contention

- **Import** : nouvelle version du design importée depuis Claude Design
  (`design/`, format bundle auto-porté : le HTML self-contained embarque les
  sources JSX en manifest gzip+base64 — extraites et réécrites dans `design/`
  pour un diff propre). Delta vs 11/06 : `modals.jsx` 356→744, `config.jsx`
  146→258, `data.jsx` 250→334 ; le plateau ne change (quasi) pas — l'ajout vit
  dans la **fiche détail**. `tweaks-panel.jsx` identique.
- **Nouveau modèle de carte** (9 champs, aucune suppression) : `risks`
  ({type, desc}), `projectConstraints` (ids), `contentionProfiles` +
  `contentionNote`, `chargeByProfile` ({profileId, jh, done}), `alerts`,
  `dateRdr`, `budgetRdli` (enveloppe RDLI arbitrée) et `budgetEngaged`
  (engagé). RDLI/engagé portés par la carte/Subject (pas par le port
  `Financials` — valeurs d'arbitrage, pas financiers PPM standard).
- **Nouvelles typologies = membres de plein droit de `BoardConfig`**
  (choix auteur : « fully overridable ») : `profiles` (19, DSI),
  `roleFamilies` (6), `roleOf` (ressource→famille), `riskTypes` (6),
  `projectConstraints` (2), `riskSeverity` (faible/moyen/élevé). Ajoutées à
  `config/board.json`, validées par `core/config.ts`, servies par
  `/api/config`. Le panneau admin clone la config entière (`JSON.parse`/
  `stringify`) → les typologies **transitent inchangées** dans une surcharge :
  round-trip sûr sans casser « Appliquer ». (Onglet admin d'édition des
  typologies : évolution ultérieure — le round-trip suffit à la justesse.)
- **Slices livrées (1-3, testées)** :
  - **core** : `types.ts` scindé (topologie/vocab → `config-types.ts`) pour
    tenir le plafond 300 lignes ; primitives de validation extraites en
    `config-parse.ts` ; `EDITABLE` (liste blanche d'édition) élargie aux 9
    champs (validateurs structurels pour `chargeByProfile`/`risks`).
  - **fixtures** : semis des 9 champs en **passe finale** (tirages RNG
    **après** toute position/âge) → grille du plateau et âges **identiques**
    au prototype (pin S002 vert) ; nouveaux champs déterministes et corrélés
    aux valeurs réelles ; pools texte (risques/contention/alertes) dans
    `fixtures/dataset.ts` ; helpers de semis en `adapters/fixtures/extras.ts`.
  - **middle** : validation d'édition **config-aware** des 9 champs (ids de
    profil/risque/contrainte doivent exister dans la topologie) ; `stubStorage`
    de test extrait en `middle/test-helpers.ts`.
- **Vérifié** : **263 tests verts**, typecheck (3 tsconfigs), conventions
  (fichiers ≤300 / fonctions ≤40 — plusieurs scissions à cet effet). Aucune
  régression : le modèle de données est câblé bout-en-bout (l'API accepte,
  valide et sert tout le nouveau modèle).
- **Slice 4 (front) LIVRÉE & vérifiée** : fiche détail portée 1:1. `InlineEdit`
  générique + 4 éditeurs à cases (`ChargeEditor`, `ContentionEditor`,
  `RiskEditor`, `ConstraintEditor`) dans `modalEditors.tsx` ; sections lecture
  (owner-strip, RDR projetée, plan de charge j.h par profil, risque de
  contention, graphe budget croisé RDLI/estimé/engagé/réalisé, risques &
  alertes = auto-alertes dérivées + risques éditables + alertes libres) dans
  `DetailPlan.tsx` / `DetailRisk.tsx` ; dérivations pures dans `detailModel.ts`
  (pas de React). `CardDetail` recâblé : titre/codename/owner/date/risques
  édités *en ligne* → prop `onPatch` → `store.editCard` (évènement `edited`).
  Couronne SVG (top) / étoile (major) via `CritMark`. Les typologies servies
  par `/api/config` alimentent les listes des éditeurs. CSS des nouvelles
  sections ajoutée à `front/styles/modal.css` (extraite du bundle design).
  Les ressources-par-famille-de-rôle sont **calculées mais non rendues** dans
  le design v10 (section retirée) — donc non portées ; panneau « délais
  kanban » (lead/cycle) reporté (historique de mouvements conservé).
  **Vérifié en navigateur (1920×1080)** : 150 cartes, fiche complète rendue
  fidèlement (owner « Mme Laurent », RDR « 12 avr. 2027 · dans 279 j », plan de
  charge CdP INFRA SSI, graphe budget avec trait RDLI, risque SSG, note de
  contention) ; **édition en ligne round-trip** (ajout d'alerte → `POST
  /api/events 201` type `edited` seq 769 sur S034 → refetch) ; 10 couronnes
  (top) + 30 étoiles (major) conformes au récap ; zéro erreur console.
- **Outils demandés par l'auteur** : `npm run import-design`
  (`scripts/import-design.ts`) — ré-importe un export Claude Design en une
  commande : décompresse les sources JSX du manifest gzip+base64 du bundle,
  les réécrit dans `design/*.jsx` (appariées par similarité de contenu) et
  imprime un delta par fichier (idempotent quand le design n'a pas bougé).
  « the card content will probably move again » → `git diff design/` montre
  alors exactement ce qui a changé. Lancement du produit : double-clic sur
  **« Lancer le tableau.cmd »** (déjà présent) = `npm start`.
- **Total : 263 tests verts, typecheck 3 tsconfigs, conventions, build.**
  Plusieurs scissions de fichiers/fonctions pour tenir les plafonds
  (`config-types.ts`, `config-parse.ts`, `adapters/fixtures/extras.ts`,
  `middle/test-helpers.ts`, `front/detailModel.ts`, `DetailPlan/DetailRisk`).

### 2026-07-07 — Conteneurisation & livraison (RP6) + dossier de remise

- **Images réellement constructibles** (ADR 015). `Dockerfile.middle` réécrit
  sur le modèle **exécution TS directe** (`node middle/main.ts`, Node 22.18
  type-stripping — plus de faux `build`/`dist`) ; copie `core/ middle/ config/`,
  `npm ci --omit=dev`, volume `/data` (JSONL), génère son propre `sbom.json`.
  `Dockerfile.front` : ajout du proxy `/api` (`docker/nginx.default.conf.
  template`, upstream `MIDDLE_HOST`/`MIDDLE_PORT` par envsubst). `.dockerignore`
  ajouté ; Node épinglé `22.18-alpine` ; `compose.yaml` réécrit (volume JSONL,
  `db` sous profil `postgres` infra-seule, `DATABASE_URL` trompeur retiré).
- **Vérifié par équivalents hôte** (pas de Docker sur la machine d'auteur) :
  build front → `front/dist` (CSS 35 Ko avec la couche v10) ; `node
  middle/main.ts` + env conteneur → l'API sert 150 cartes / 768 évts et la
  config (19 profils, 6 types de risque) ; `node scripts/sbom.ts` → CycloneDX
  1.5 (202 composants) ; seed → 150 cartes JSONL. Le 1ᵉʳ `docker build` reste
  à lancer sur une machine Docker (runbook `LIVRAISON.md` §8).
- **`LIVRAISON.md`** (dossier de remise) : livrables, construire, lancer,
  config/env, SBOM, stockage, checklist, **runbook de test local Docker**.
- **Décision stockage (auteur)** : **stockage fichier JSONL durable retenu
  pour la 1re mise en service** (volume persistant sauvegardé, middle
  mono-instance) → **zéro dépendance hors plafond, pas de `pg` à autoriser**.
  PostgreSQL/`pg` = voie d'escalade (scaling / SGBD), un adaptateur derrière le
  port `BoardStorage`. Les 2 points au référent deviennent : (1) volume durable
  OK ou Postgres d'emblée, (2) canal de livraison/registre.
- **ADR 014** (import design v10) et **ADR 015** (conteneurisation/livraison)
  écrits ; ADR 001/008/009/010 marqués « supersédé par ADR 011 » ; résumé
  ARCHITECTURE réaligné (263 tests) ; README/CLAUDE/DEPENDENCIES réconciliés
  v9→v10 et sur la surface de dépendances réellement installée.

### 2026-07-07 — Adaptateur PostgreSQL (pg autorisé) + port de stockage async

- **`pg` autorisé** par le référent (appel PostgreSQL depuis le middle OK). Le
  back PostgreSQL mandaté devient réel ; le stockage fichier JSONL était un
  stopgap, conservé en repli mono-instance. ADR 016.
- **Port `BoardStorage` passé en asynchrone** (pg n'a pas d'API sync) : les
  méthodes renvoient des `Promise`. JSONL enveloppe son corps sync (throw →
  rejet) ; `getBoard`/`postEvent`/`postCard`, `app.ts` (routes async, Express 5
  propage les rejets), `main.ts` (top-level await) et `seed.ts` `await`. `core/`
  inchangé (le port est une interface). Conversion pilotée par le typecheck.
- **`middle/storage/postgres.ts`** : un seul fichier derrière le port. Schéma
  `cards` (upsert par id, ordre par colonne identité) + `card_events`
  **append-only** (séquence bigint → `evt-<seq>`, **trigger** bloquant
  UPDATE/DELETE) ; SQL paramétré, pas d'ORM, `jsonb` (mêmes coercitions que le
  JSONL). Connexion `DATABASE_URL`/`PG*`. `select.ts` : `postgres` + `jsonl`.
  Test de frontière resserré : `pg` importé **uniquement** par son adaptateur.
- **Conformance** : le pilote Postgres passe la même suite que le JSONL, contre
  une **base réelle** (`storage/postgres.test.ts`, gardé par `KANBAN_PG_TEST_URL` ;
  sinon skip), + le test du trigger append-only. **Vérifié live** : 13/13 verts
  contre `postgres:16-alpine`.
- **compose** : `db` (PostgreSQL 16) dans le profil `app` ; middle
  `KANBAN_STORAGE_DRIVER=postgres` + `DATABASE_URL`, `depends_on: healthy` ;
  petit volume `config-data` pour l'override de config (fichier). Docs
  réalignées (LIVRAISON §6/§7/§8/§9, DEPENDENCIES, ADR 015→016) ; lanceur Docker
  mis à jour (up puis seed Postgres).
- **Vérifié** : 263 tests verts (+13 Postgres skip sans base), typecheck ×3,
  conventions ; build + run Docker de la pile Postgres complète.

### 2026-07-09 — Adoption du design v11 (archivage, blocage gouverné, nature positionnelle, réordonnancement)
- **Analyse préalable** : delta v10→v11 du dossier `design/` cartographié par
  revue multi-agents (7 fichiers, ~25 changements produits), chaque écart
  classé implémenté / partiel / manquant contre le code réel. Quatre
  décisions d'auteur actées : réordonnancement adopté (event-sourcé),
  archivage par évènements, **la nature EST le canal** (pas une étiquette),
  ancres des Délais résolues depuis la config.
- **Archivage** (ADR 017) : évènements `archived`/`unarchived` (append-only,
  validés par le middle) ; le repli garde la carte (`archived: true`), le
  front l'exclut du plateau et de tous les compteurs ; vue « Archives »
  (recherche, désarchiver, ouvrir la fiche) + badge compteur en en-tête ;
  Escape déroule fiche → ajout → archives → panneau → focus → canaux.
- **Blocage gouverné** (design v11) : section BLOCAGE dédiée sous Risques —
  motif **obligatoire** (bouton désactivé sans texte), bannière + « Lever » ;
  la case « Bloqué » du formulaire d'édition disparaît (c'était le dernier
  chemin qui bloquait avec un motif par défaut). Alertes auto et liste
  d'alertes libres retirées de la fiche (« Risques & alertes » → « Risques » ;
  le champ `alerts` reste au modèle pour le replay, fixtures à vide).
- **Historique & Délais** : deux sections repliables (fermées par défaut).
  Historique raconte aussi les blocages/déblocages (points rouge/vert, motif)
  — projection des évènements réels. Délais : âges par étape + lead/cycle
  time par carte (`core/flow.ts`), ancres résolues depuis la config runtime
  (ids NMO puis repli structurel : gates, positions) — jamais codées en dur.
- **Nature positionnelle** (ADR 018) : `lanes[].natureKey` en config (défaut
  `complicated`, éditable au panneau admin) ; nature retirée de `CardPatch`
  et du whitelist d'édition (un patch historique est ignoré au replay) ;
  dérivée du canal à la création (serveur) et à l'affichage — déplacer une
  carte vers un autre canal la requalifie immédiatement. Sélecteur Nature
  retiré des formulaires ; filtre Nature retiré de la sidebar, remplacé par
  « Bloqués uniquement » (dans le FilterState core).
- **Interactions plateau** : un seul clic ouvre la fiche (fin du clic en deux
  temps) ; cellules repliées cliquables avec **popover tickets** (ouverture
  en un clic) ; la dernière ligne dépliée refuse de se replier (garde
  config-aware) ; indice de défilement par `ResizeObserver` ; lavis rouge des
  cellules au-delà du WIP ; étiquette de canal replié en pastille
  horizontale.
- **Réordonnancement manuel** (ADR 019) : dépôt d'une carte SUR une autre —
  `payload.beforeId` sur l'évènement `moved`, ordre rejoué au repli ;
  même-cellule accepté **uniquement** comme réordonnancement, sans remise à
  zéro de l'horloge d'âge, non narré dans l'historique, ignoré des métriques
  d'étape. Indicateur d'insertion bleu pendant le survol.
- **Découpes 300 lignes** : `middle/validation.ts` (validateurs de patch),
  `core/config-derive.ts` (laneNature + reconcileCardRefs), `core/flow.ts`,
  `core/state.order.test.ts` et `middle/api.moved.test.ts` créés.
- **Vérifié** : 282 tests verts (+19), typecheck ×3, conventions ; chaque lot
  vérifié en direct dans l'app (blocage bout-en-bout, archive/désarchive,
  requalification par changement de canal, réordonnancement persistant avec
  âge conservé, popover, garde du dernier canal) contre la pile Docker
  Postgres (middle reconstruit). CLAUDE.md §4/§5 réalignés (encart v11).
- **Revue adversariale post-implémentation** (5 dimensions, trouvailles
  contre-vérifiées) — correctifs appliqués : (1) le repli classe désormais
  les réordonnancements par l'ÉVÈNEMENT enregistré (`isReorder`), le même
  prédicat que l'historique/Délais/métriques — plus de divergence possible
  entre plateau et projections sur un journal issu d'une course ; (2) les
  écritures du middle (évènements + créations) sont **sérialisées** en
  processus (`serializedWrite`) — la fenêtre valider-puis-écrire ne laisse
  plus deux intentions concurrentes se valider contre le même repli périmé
  (sain pour le modèle mono-instance ; un middle multi-instances exigerait
  un verrou côté base) ; (3) gardes ajoutées : déplacer une carte archivée
  → 400, re-bloquer une carte bloquée → 400 (l'horloge andon ne repart plus
  en silence), `beforeId` vers une carte archivée → 400, patch d'édition
  vide → 400, textes libres d'édition **bornés** (titre 200, owner 120,
  notes 5000, etc. — le journal est permanent) ; (4) suppression : l'ordre
  du repli oublie la carte (plus de cible fantôme pour `beforeId`) ; (5)
  front : fiche archivée → « Désarchiver » (fin du 400 assuré), tag Nature
  retiré de la fiche (v11), Échap contenu dans le motif de blocage et les
  éditions en ligne (n'emporte plus la fiche), glyphes de criticité de la
  sidebar alignés (★ Major / ♛ Top), formulaire d'édition complété (Date
  RDR, Enveloppe RDLI, Budget engagé), surbrillance de glisser rafraîchie
  au survol des cartes. **286 tests verts** (+4 tests de régression).
  Écarts hérités du design, non corrigés (assumés) : popover de cellule
  repliée fermé au survol du popover seulement ; brouillon de commentaire
  vidé avant confirmation serveur ; bord admin « références périmées »
  (dépôt-sur-carte remappée → 400 propre).

### 2026-07-10 — Micro-refonte des tickets (décision auteur)
- **Un signal par information** : le point rouge pulsé disparaît des tickets
  bloqués — le lavis rouge suffit ; la pulsation reste dans la bannière
  BLOCAGE de la fiche (`blk-pulse` conservé là).
- **Lisibilité** : les pictos de criticité (♛ Top / ★ Majeur) passent APRÈS
  le nom du projet ; les tickets alignent désormais type de projet puis nom,
  l'âge restant à droite (`card-fill` élastique entre picto et âge).
- CLAUDE.md §5 mis à jour. Front seul (cards.tsx + cards.css).

### 2026-07-10 — Adminer démo : édition structurée des cartes et évènements
- **Problème** : les tables `cards` et `card_events` stockent le document
  entier dans une colonne `data jsonb` — dans Adminer, éditer une carte
  revenait à modifier un gros bloc JSON brut (pénible, risqué).
- **Solution** : plugin Adminer maison `docker/adminer/card-boxes.php`
  (mécanisme officiel `plugins-enabled/*.php` de l'image, hooks
  `editInput`/`processInput` vérifiés sur l'Adminer 4.17.1 embarqué),
  monté en lecture seule par compose (image épinglée `adminer:4.17.1`).
  L'écran d'édition éclate `data` en boîtes typées par champ : selects pour
  les enums (criticité, nature, source, type d'évènement), case pour
  `blocked`, nombres nullables, dates ISO, listes une-entrée-par-ligne
  (tags, ressources…), mini-JSON pour les structures imbriquées
  (chargeByProfile, risks, custom, payload) ; `id` verrouillé (= PK).
  Repli « JSON brut » repliable qui GAGNE quand sa case est cochée (ajout/
  retrait de clés).
- **Intégrité** : réassemblage à partir du document original — clés
  inconnues préservées (boîte mini-JSON générique), types respectés
  (décodage stdClass : `{}` reste un objet), valeur illisible ⇒ valeur
  d'origine conservée ; ensemble de clés prouvé identique avant/après.
- **Vérifié sans navigateur** (session curl + psql) : login, rendu des
  34 boîtes carte + 7 boîtes évènement, édition mixte (texte/nombre
  décimal/liste) persistée avec les bons types jsonb, repli brut (clé
  ajoutée, boîtes ignorées), sous-JSON invalide ⇒ base conservée,
  antidatage d'un `ts` d'évènement (garde OFF) et refus propre du trigger
  (garde ON), `/api/board` replie toujours (784 évènements). Données démo
  restaurées après test.
- Outillage démo uniquement (profil compose `tools`) : aucun code produit,
  aucune dépendance, rien de livré à la plateforme.

### 2026-07-15 — Passe de polissage : tests, durcissement conteneurs, docs
- **Couverture de tests +32** (286 → 318) : `front/detailModel.ts` (dérivations
  budget / RDR / plan de charge), chemin d'erreur 500 du middle (non-fuite des
  erreurs internes dans la réponse), interrupteur append-only Postgres OFF puis
  restauration au réouverture par défaut, et scanner de conventions extrait en
  module testable (`scripts/conventions.ts` + `conventions.test.ts`).
- **Durcissement des conteneurs** (audit vérifié, tous S) : en-têtes de sécurité
  sur la **page** nginx (et plus seulement l'API Express) ; middle en
  utilisateur `node` **non-root** ; écouteur `error` sur le Pool `pg` (un
  incident de base au repos ne fait plus tomber le process) ; images de base
  **épinglées par digest** ; ports publiés **liés à la loopback** (l'API non
  authentifiée et la base de dev ne sortent pas de la machine). Pile Docker
  durcie reconstruite et vérifiée de bout en bout : 150 cartes servies, en-têtes
  présents sur la page, rendu sans violation CSP, `whoami`=`node`, stockage
  `postgres`.
- **Documentation remise en cohérence** : README, SECURITY, DEPENDENCIES,
  middle/README, sync/README, `core/ports.ts`, ce résumé et la liste « À venir »
  — alignés sur l'état réel (design v11, PostgreSQL livré, `pg` autorisé,
  durcissement fait, métriques faites). Auth (RP3) toujours différée : décision
  assumée de l'auteur (un seul utilisateur de confiance pour l'instant).

### 2026-07-16 — Mode réseau opt-in (FRONT_BIND)
- L'adresse d'écoute du **seul point d'entrée publié** (front nginx :8080) est
  paramétrée : `${FRONT_BIND:-127.0.0.1}` dans le compose. Défaut inchangé =
  loopback (rien de joignable depuis le réseau). Nouveau lanceur
  **« Lancer en Docker (reseau).cmd »** : met `FRONT_BIND=0.0.0.0`, tente la
  règle de pare-feu entrante (TCP 8080), affiche les URL à communiquer.
  Middle/db/Adminer restent câblés en loopback — tout accès passe par le front
  en même origine. Consigné dans LIVRAISON.md et SECURITY.md avec
  l'avertissement : pas d'auth avant RP3 → segment réseau restreint seulement.

### 2026-07-28 — Design v12 : totaux d'agrégats et lecture de gouvernance
- **Le tableau porte l'argent et la capacité, pas seulement le flux.** Nouveau
  module d'agrégation `core/totals.ts` (enveloppe RDLI / estimé / engagé /
  réalisé en k€, plan de charge et consommé en j.h, ventilés par profil) :
  **une seule arithmétique** lue par l'en-tête de colonne, l'étiquette de canal
  et la vue Metrics, donc aucune divergence possible. L'agrégat porte sur les
  cartes **visibles** (les estompées sont exclues) ; l'archivage reste au
  soin de l'appelant, contrat écrit dans la doc du module.
- **Deux bascules Σ dans le coin du tableau**, mémorisées par navigateur.
  C'est la **première persistance côté client** du produit
  (`front/useUiPrefs.ts`) : deux booléens de confort, jamais de donnée de
  portefeuille, chaque accès protégé, interdit à `core/`.
- **Critère « une seule page » : mesuré en mode compact**, l'état par défaut.
  `LAYOUT.columnHeadHeight` 38 → **65 px**, valeur mesurée dans l'application.
  Vérifié à 1920×1080 avec 150 cartes : `scrollX = 0`, `scrollY = 0`, aucune
  cellule en débordement. Les totaux dépliés (~230 px) et la gouttière élargie
  (176 px) sont un zoom volontaire qui peut défiler ; liste des profils
  plafonnée. Conséquence assumée : les totaux de colonne sont **repliés par
  défaut**, alors que la maquette les ouvrait. **Coût mesuré** : 27 px
  d'en-tête = une barre visible en moins par ligne (17 → 16), donc la cellule
  la plus pleine (19 sujets) écrête 3 barres au lieu de 2 ; borne du test
  d'acceptation recalibrée 2 → 3, raison inscrite dans le fichier. La borne
  « le contenu tient dans l'écran » est inchangée.
- **Vue Metrics entièrement réécrite** (« Métriques de flux » → « Metrics ») :
  6 KPI puis budget croisé, risque de contention, charge restante par rôle,
  flux (débit 30/90 j + lead/cycle), encours vs limites, risques par entité +
  contraintes, blocages. `core/metrics.ts` réécrit et scindé
  (`core/metrics-flow.ts`) ; la vue scindée en `metricsPanels.tsx`.
  **Abandonnés** (décision auteur) : temps moyen par étape, composition d'âge,
  goulot principal — `computeFlowMetrics` et `stageDurations` supprimés. Le
  principe de l'ADR 007 est intact (métriques = requêtes sur le journal).
- **Limite d'encours cumulée = nb de canaux × `colonne.wip`** : le produit n'a
  pas de limite par canal (topologie par colonne, ADR 013), et ce produit est
  exactement la limite de la colonne entière.
- **Étapes terminales dérivées de la config** (`terminalColumnIds`,
  `core/flow.ts`) — même ancrage que les Délais de la fiche. La maquette les
  codait en dur, ce qui aurait mis le débit à zéro au premier renommage.
- **Filtre « Contrainte »** (OU-formé) : une carte reste allumée tant qu'une de
  ses contraintes est active ; la pastille « Aucune » filtre l'absence et vit
  dans son propre champ (`noConstraint`), jamais comme clé — aucun identifiant
  admin ne peut la percuter. Libellés et couleurs issus de la config.
- **Allègements** : la fiche perd le canal (déjà lu spatialement), la carte en
  focus troque sa barre de progression contre « est. k€ · RAF j.h ».
- **Fixtures** : contrainte projet en jet pondéré (28/24/8/40 %). Déterminisme
  préservé, mais un tirage de moins ⇒ les extras des sujets suivants changent.
  Visible seulement après réamorçage du magasin.
- Aucun changement de schéma, de migration ni de code `middle/`.
- ADR 020. Vérifié en application : 340 tests verts, conventions vertes,
  typecheck vert, 7 panneaux rendus, filtre contrainte 150→122→119→104→0→150,
  aucun artefact de rendu (sondage DOM : seuls les 6 `.gate-line` DoR/DoD
  attendus, tous confinés).

### 2026-07-29 — Import CSV, étape 1 : RDOM en mode audit
- **RP4 démarre par le parseur d'import**, construit fichier par fichier
  (`RDOM` → `SP_total` → `projet` → `ressources_PDC`) selon le contrat
  consigné dans `docs/IMPORT-MAPPING.md`. Décisions d'auteur du jour :
  entrée en **CSV** (Q13 — aucune bibliothèque, plafond SBOM intact) ; la
  table **`RDOM`** (domaine ↔ nom) remplace `CORRESP` et sert deux usages —
  domaine via le responsable de portefeuille ET exclusion des RDOM pour
  dégager le chef de projet (Q4+Q5 tranchées).
- **Mode audit pur** : rien n'est chargé, le produit est le rapport
  (inventaire, pris, écarté, douteux, signalements — rien d'ignoré en
  silence). Nouveau `adapters/csv-import/` : modules purs sans accès disque
  (décodage UTF-8/1252 signalé, lecteur CSV artisanal `;`, **reconnaissance
  par contrat d'en-têtes jamais par nom de fichier**, rapport déterministe),
  CLI mince `sync/import.ts` (`npm run import -- <dossier>`) qui lit la
  config via `getRuntime()` — un override admin est respecté.
- La résolution des domaines accepte id, nom ou code court (`ING`, `A&D`…) ;
  doublons fusionnés + signalés, nom sous deux domaines → douteux, domaine
  sans RDOM → avertissement de couverture.
- Échantillon synthétique `fixtures/import/RDOM.csv` (12 noms inventés, 9
  domaines). Aucune donnée réelle : la vraie table sera un CSV créé côté
  client, hors dépôt.
- ADR 021. Vérifié : 390 tests verts (~50 nouveaux), conventions vertes,
  typecheck vert ; essai CLI sur l'échantillon → 12 pris / 0 écarté /
  0 douteux, rapport identique sur double exécution (hors ligne de date),
  usage/dossier invalide → exit 1.

### 2026-07-29 — Premier passage réel du parseur : leçons et correctif
- Premier audit sur les exports réels (VM cliente) : l'export `Projets.csv`
  porte lui aussi des colonnes « Domaine » et « Nom » et **volait le contrat
  RDOM** par ordre alphabétique (1 357 lignes écartées, 0 pris — l'audit a
  tout expliqué, rien avalé). Correctif : **l'en-tête le plus juste gagne**
  (moins d'écarts, puis ordre des noms) ; les autres candidats passent en
  douteux avec le décompte des écarts.
- Confirmations de terrain : exports en **Windows-1252** (détecté, signalé,
  lu) ; noms de fichiers réels ≠ noms attendus (la reconnaissance par
  en-têtes fait le travail) ; `Ressources_PdC` porte bien les années en
  en-têtes à deux niveaux (« 2026 » puis colonne vide, jusqu'à 2029) ;
  `SP_total` a un **préambule au-dessus de ses en-têtes** (« FAUX »,
  « montants calculés pour : ») → l'étape 2 devra chercher la ligne
  d'en-têtes sous le préambule.

### 2026-08-01 — Le chef de projet revient de l'export brut
- **Constat sur les vrais fichiers** (premier assemblage complet : 148
  cartes, domaine 148/148, plan de charge 139/148) : **chef de projet
  0/148** — le consolidé n'a pas de colonnes Responsable. Le contrat
  `projets` (export brut) **revient au registre** comme unique source de
  l'`owner` ; ses lignes ne deviennent jamais des cartes, elles enrichissent
  le périmètre du consolidé par jointure nom puis titre. Q20 fermée.
- **Priorité des contrats = ordre du registre** (consolidé, projets,
  SP_total, PdC, RDOM — du plus spécifique au plus générique) : un fichier
  correspondant pleinement à plusieurs contrats prend le premier. Règle
  plus robuste que « le plus de colonnes trouvées » : le consolidé ne peut
  plus être pris pour l'export brut s'il gagne des Responsable, et RDOM
  (deux colonnes génériques) ne peut plus rafler un export riche.
- Le rapport dit la provenance : « chef de projet : n/N (dont m via
  l'export `projet`) · k carte(s) sans ligne dans l'export ».
- Correctif d'affichage : totaux j.h arrondis au dixième (les données
  réelles sortaient « 25011.0399999997 »).
- 449 tests verts, conventions et typecheck verts.

### 2026-07-31 — Import CSV, étape 4 : le plan de charge rejoint les cartes
- **Contrat `ressources_pdc`** (libellés réels) : en-têtes à deux niveaux
  reconstruits — « 2026 » au premier niveau, la sous-ligne Prév./Réel
  détectée et consommée (repli positionnel signalé). Seul 2026 est lu
  (fenêtre annuelle, 200 j.h = 1 ETP).
- **Lecteur `pdc.ts`** : Métier → profil DSI (liste blanche tolérante,
  préfixes pointés décollés et relevés — Q9), inconnu/vide → seau « non
  attribué » questionné ; lignes sommées par projet × profil, jamais
  supposées uniques ; réel > prévisionnel conservé + signalé (Q12) ;
  `charges.ts` joint sur les cartes (nom > code > titre) et émet la
  **consolidation nominative** (top 15, taux ETP) — les noms ne quittent
  pas la machine. La ligne d'assemblage « plan de charge » chiffre la
  couverture, les totaux 2026 et les orphelins des deux côtés.
- 441 tests verts ; essai CLI 4 squelettes : 3/6 cartes couvertes,
  170 j.h prév · 78 réel, 1 projet PdC hors périmètre, préfixe « Externe »
  relevé, mobilisation nominative émise.

### 2026-07-31 — Le consolidé devient la source unique des cartes
- **Simplification finale de l'auteur** : l'onglet consolidé (déposé en
  `Projets.csv`, 185 lignes, 53 colonnes dictées et verrouillées) porte
  tout sauf le plan de charge — les exports bruts `SP_total` et `projet`
  sortent des attendus (leurs contrats restent : s'ils sont présents, ils
  comblent les trous). Mapping direct consolidé → carte (budgets RDLI/ME,
  charges (J), Début/Fin, type, domaine « (Ptf) » au vocabulaire board).
- **Position** : plus de jalons datés dans la source — « Jalon en cours »
  est relevé (valeurs comptées au rapport) et la règle valeur → colonne
  reste à dicter (**Q19**) ; d'ici là tout en Demandes (Q1). **Chef de
  projet** : indisponible dans cette source (**Q20**).
- Vérifié : 438 tests verts ; assemblage à 3 fichiers (RDOM + consolidé
  seuls) : 5 cartes, budgets/charges/dates du consolidé, relevés Jalon en
  cours / Complexité / États émis ; l'appoint SP_total continue de
  positionner quand il est là.
- **Correctif du même jour (premier passage réel)** : « isProjetSIS » ne
  discrimine pas (SIS = SI du **Soutien**, hors DSI — l'inversion écartait
  les ~159 vrais projets) → informatif seulement, **le périmètre = les
  lignes du fichier** ; le consolidé apporte désormais aussi le **chef de
  projet** (Responsables 1→3 moins RDOM, repli domaine par « Responsable
  portefeuilles ») → Q20 fermée ; le contrat `projets` (brut) sort du
  registre (il aurait volé la reconnaissance) ; le « Pris » du rapport =
  les cartes, `SP_total` comble en silence. Modules : `cells.ts` (lecteurs
  de cellules partagés), `projets.ts` retiré. 434 tests verts.

### 2026-07-30 — Import CSV, étape 3 : le consolidé assemble les cartes
- **L'assemblage s'inverse (Q18)** : l'onglet « Projets » du classeur de
  consolidation de l'auteur devient le **fichier maître du périmètre** —
  ses lignes retenues (`isProjetSIS` vrai) SONT les cartes ; `SP_total`
  enrichit (jalons → position, budgets), `Projets.csv` enrichit (chef de
  projet = Responsables 1→2→3 moins les RDOM, domaine de repli par nom de
  RDOM sur « Responsable portefeuilles », mots entiers — MARTINEZ ne
  déclenche pas MARTIN), la table RDOM arbitre. Nouveau contrat
  `consolide` (requis réduit au trio sûr Nom / Domaine (Ptf) / isProjetSIS,
  le reste optionnel/ignoré — les extras du rapport verrouilleront les
  libellés photographiés), contrat `projets` (libellés réels du relevé).
- **Jointures par confiance décroissante** : nom complet, puis code PE,
  puis titre sans code — chaque chemin compté, désaccord code/titre →
  douteux (le code gagne), sujets SP_total hors consolidé comptés « hors
  périmètre ». Nouveaux modules `consolide.ts`, `projets.ts`, `enrich.ts`
  (cartes enrichies + stats), `assembly.ts` (lignes d'état) ;
  `parseFrenchBoolean` (VRAI/FAUX/OUI/NON/1/0).
- **Le rapport d'assemblage dit tout** : périmètre (retenus/exclus),
  répartition des cartes, position par jalons (n/N et par chemin de
  jointure), couverture domaine (consolidé/RDOM/manquant), chef de projet,
  hors-périmètre ; relevés « Complexité du projet » (candidat canal) et
  « Domaine (Ptf) » inconnus.
- 437 tests verts (+13) ; essai CLI sur les six squelettes : 5 cartes
  (Demandes 2 · Actifs 1 · Exploitation 2), jointures nom 1 · code 4,
  domaine et chef 5/5, 1 exclu de périmètre, 3 hors périmètre.

### 2026-07-29 — Import CSV, étape 2 : SP_total en mode audit
- **Le contrat `SP_total`** (libellés réels du relevé du jour) rejoint le
  registre : 10 colonnes requises (Nom, Type, Début, 3 jalons, 4 montants),
  « État suivant autorisé » en optionnelle (relevé des valeurs distinctes =
  matière pour Q1), 12 colonnes **ignorées connues** — nouveau concept de
  contrat : réclamées sans bruit, listées une fois au rapport, jamais en
  « colonne en trop ».
- **Recherche d'en-têtes sous préambule** (`identify.ts`, extrait de
  l'orchestrateur) : la ligne d'en-têtes est cherchée parmi les ~20
  premières lignes non vides — l'export réel `SP_total` porte une ligne de
  filtres au-dessus (« Afficher les montants calculés pour : », « FAUX »).
  Préambule signalé, jamais silencieux.
- **Lecteur `sp-total.ts`** : découpage du Nom (code `PE` 4-6 chiffres
  toléré et signalé → `codename`, reste → titre), Type par liste blanche
  (inconnus → douteux par libellé distinct), position par jalons **ancrée
  sur la config** (RDR validé passé → dernière colonne ; RDLI validé passé
  → ancre d'activation ; sinon colonne d'entrée — amont par défaut, Q1
  ouverte), **jalon daté dans le futur signalé et non compté** (règle Q15,
  « oui »/« x » compté passé + signalé), montants français (virgule,
  espaces, erreurs de formule signalées), `Début` → `createdAt` (ex-Q6
  tranchée). Signalements **agrégés** par motif+colonne (compte + première
  ligne) pour rester lisibles à 1 400 lignes ; le pris reste par carte.
- **Horloge injectée** : `runImportAudit(files, config, now)` — la règle du
  futur est déterministe et testable.
- **Attrapé par l'audit lui-même** : l'apostrophe typographique de la
  config (« Gestion d'obsolescence ») ne s'appariait pas à l'ASCII des
  exports — unifiée dans `normalizeLabel`.
- **Revue adversariale (15 correctifs)** — les trouvailles confirmées :
  un **match complet domine désormais tout near-miss** (le vrai
  `Projets.csv`, porteur de Nom+Type+Début, aurait été diagnostiqué
  « SP_total incomplet ») ; les **lignes de total/sous-total sont exclues**
  (contrôle obligatoire — double compte) ; jalons incohérents (RDR sans
  RDLI) signalés ; codes PE anormaux signalés (casse, espaces, longueur,
  7+ chiffres non extraits, nom réduit au code) ; **même code sous deux
  noms → douteux** (détecteur de renommage) ; années à 2 chiffres : pivot
  70 (95 → 1995, plus jamais 2095) ; VRAI/FAUX d'Excel = oui/non
  explicites ; lectures en série Excel et unités dans les cellules
  signalées ; datetimes FR tolérés ; « aujourd'hui » comparé en date
  **locale** (plus de « futur » fantôme entre minuit et 2 h) ; lignes
  tronquées comptées ; near-miss enrichi (ligne + en-têtes vus) ; borne de
  recherche d'en-têtes dite quand atteinte ; « Début » vides comptés ;
  agrégats avec jusqu'à 8 numéros de ligne. Nouveaux modules
  `subject-name.ts` et `tallies.ts` (plafond 300 lignes).
- 418 tests verts (+26), conventions et typecheck verts ; essai CLI sur les
  squelettes : 20 pris, 1 douteux voulu (type inconnu), 6 signalements
  attendus, rapport identique sur double exécution.

### 2026-07-29 — Fix : la molette défile dans les cellules pleines, tous modes
- La flèche d'indication (v11) promettait un défilement que seul le mode
  focus offrait : `.cell-cards` était `overflow: hidden` hors focus. Réglé
  dans `front/styles/board.css` : `overflow-y: auto` partout,
  barre de défilement masquée sur les cellules compactes (le radiateur
  reste dense), visible en focus comme avant. La page, elle, ne défile
  toujours pas (critère « une seule page » revérifié à 1920×1080,
  150 cartes : débordement 0×0 ; hint et molette vérifiés en application).
- Signalé par l'auteur : le défilement ne répondait jamais sur la VM Linux
  cliente — à revérifier sur site avec ce correctif (CSS standard, aucune
  fonctionnalité récente dans le chemin du scroll).

### À venir
- **RP3** : auth JWT-en-cookie (login, rôles viewer/editor/admin, acteur =
  utilisateur authentifié à la place de « anonymous ») ; CLI de comptes ;
  durcissement d'audit. `scrypt` (node:crypto) pour les mots de passe.
  Décidé/documenté ; **rien encore implémenté**. Présent à câbler :
  `jsonwebtoken` + `cookie-parser` (dans le plafond SBOM, **pas installés** ;
  middle n'a qu'express + @types/express) ; **aucune table `users`** (schéma
  dans CLAUDE.md §4, non implémenté) ; pas de CLI de comptes, pas de
  middleware d'auth. **Couture acteur** : constante `SERVER_ACTOR =
  "anonymous"` dans `middle/api.ts`, passée à chaque constructeur d'évènement ;
  `postEvent` ne prend pas d'identité — RP3 doit faire transiter l'identité
  authentifiée requête → route `app.ts` → `postEvent` → builders.
- RP4 : l'étape 1 du parseur (RDOM, audit) est **faite** (ADR 021) ;
  restent les étapes 2-4 (`SP_total` cartes, `projet` domaine+chef de
  projet, `ressources_PDC` charge — questions Q1/Q3/Q15 notamment), le mode
  chargement réel via `BoardStorage.importCards`, puis sciforma + sync ;
  RP5 métriques (**vue implémentée**, ADR 007) ; RP6 **CI plateforme** — la
  conteneurisation (ADR 015) et l'adaptateur `pg` (ADR 016) sont **faits**,
  et il n'y a **pas** de build TS→JS (exécution TypeScript directe sous
  Node 22) ; reste l'intégration CI dans la plateforme du client. Chaque
  phase : une entrée datée ici.
