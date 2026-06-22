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

### À venir
- **RP2** : front React 18 + Vite (descente 19→18, Vite 8→7), `ui/` → `front/`,
  au-dessus de `core/` inchangé ; design system Tailwind/Radix ensuite.
- RP3 auth JWT ; RP4 csv-import/sciforma + sync ; RP5 métriques ; RP6
  conteneurisation + CI plateforme (build TS→JS du middle, nginx du front).
  Chaque phase : une entrée datée ici.
