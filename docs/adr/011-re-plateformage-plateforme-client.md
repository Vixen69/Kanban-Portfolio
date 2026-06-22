# ADR 011 — Re-plateformage vers la plateforme conteneurisée du client

## Contexte

Le 2026-06-19, le référent technique du client autorise le portage de l'outil
**à condition** qu'il reste dans le plafond SBOM de leur plateforme
conteneurisée : front **React 18 / Vite**, middle **Node / Express / TS**,
back **PostgreSQL**, le tout en **Docker**. L'outil reste celui de l'auteur
(pour l'équipe PMO) ; le référent ne gouverne que ce plafond (ce qui peut
tourner sur la plateforme), pas les décisions de conception internes.

Ceci **supersède les contraintes minimalistes initiales** (budget 1/12,
`node:http`, SQLite, CSS écrit à la main uniquement, pas de framework). Les
Sprints 1-3 ont validé le produit, les ports et le modèle évènementiel sur la
pile initiale ; ce socle est repris.

## Décision

- **Monorepo workspace npm.** `core/` devient un paquet workspace
  (dépendance-zéro, TS pur), partagé par `front/` et `middle/`. RP0 formalise
  `core/` comme paquet ; le câblage workspace complet et les imports par nom
  (ou alias tsconfig) sont finalisés quand `middle/` consomme `core/` (RP1).
- **middle/** (RP1) : Express + **`pg`**, derrière le port `BoardStorage`.
  Reprend telle quelle la logique d'API (validation, fold, construction
  d'évènements) ; back **PostgreSQL**. Express car les middlewares `cors` /
  `cookie-parser` du SBOM en dépendent.
- **front/** (RP2) : React 18 + Vite, au-dessus de `core/` inchangé. CSS écrit
  à la main d'abord, adaptation Tailwind/Radix ensuite.
- **Auth** (RP3) : JWT en cookie httpOnly + `scrypt` (node:crypto).
- **Docker** : conteneurs front + middle + un PostgreSQL de dev via Compose.
- **Migration par étage, pas en bloc.** Les déplacements `ui/`→`front/` et
  `server/`→`middle/` se font **avec** la réécriture de chaque étage (RP1
  middle, RP2 front), jamais avant : on ne casse pas le code éprouvé (149
  tests verts) et on évite de mélanger React 18/19 ou d'installer `pg` avant
  son autorisation.
- **Runtime** : Node `>=22.18 <24` par workspace cible (`middle/`, `front/`).
  Fait au RP1 : `server/`/node:sqlite retirés et le pin racine est passé à
  `>=22.18` (dev sur Node 24.x, cible de déploiement Node 22).

Supersède, **quant à la pile uniquement**, les ADR 001 (chaîne de build
node:http/vendor), 008/009 (node:sqlite/JSONL), 010 (serveur node:http). Leur
**raisonnement** — event-sourcing, fold-on-read (ADR 002), port `BoardStorage`,
autorité serveur sur id/horodatage/acteur — est **conservé** et reporté sur
Express + PostgreSQL.

## Conséquences

- `core/` et la logique métier survivent intacts ; le re-plateformage ne
  touche que les bords. C'est le bénéfice de l'architecture hexagonale.
- À faire autoriser par le référent : **`pg`** (hors SBOM de référence) ; le
  canal de livraison / registre d'images.
- Le rituel hors-ligne / sha256 (CLAUDE.md §7 initial) est remplacé par la
  livraison d'images conteneur dans la plateforme du client.
- RP0 pose les fondations (paquet `core`, squelette Docker + Postgres de dev,
  ce registre) **sans** perturber `ui/` et `server/`, qui restent
  fonctionnels jusqu'à leur migration.
- Déploiement à deux conteneurs : le « même origine » (front + API) nécessitera
  un reverse-proxy (nginx du front vers le middle) — détail tranché en RP2/RP6.
