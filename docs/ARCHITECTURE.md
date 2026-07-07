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
- **Référence produit** : design **v10** (ADR 014) — couche risques /
  contraintes / contention / plan de charge par profil dans la fiche détail,
  au-dessus de la v9 (ADR 012/013).
- **État live** : monorepo `core/` + `middle/` (Express, pilote JSONL — `pg`
  différé) + `front/` (React 18) ; **263 tests** `node:test` (dont les
  frontières d'architecture). Lancement dev : `npm run serve` (middle :8787)
  + `npm run dev` (front :5173, proxy `/api`) ; données via
  `KANBAN_ALLOW_SEED=1 npm run seed`. Cf. README « Démarrer ».
- **Livraison** : conteneurisée (images front nginx + middle Express, même
  origine, JSONL sur volume ; SBOM CycloneDX), ADR 015 — dossier
  `LIVRAISON.md` (construire / lancer / vérifier / test local Docker).

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
- RP4 csv-import/sciforma + sync ; RP5 métriques ; RP6 conteneurisation + CI
  plateforme (build TS→JS du middle, nginx du front, adaptateur `pg` une fois
  autorisé). Chaque phase : une entrée datée ici.
