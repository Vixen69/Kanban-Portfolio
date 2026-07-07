# Dépendances — gouvernance et justification

**Modèle de gouvernance (2026-06-19).** L'outil appartient à l'auteur et est
déployé sur la plateforme conteneurisée du client pour l'équipe PMO. Le
référent technique du client fixe le **plafond SBOM** : la liste des
composants open-source et des versions autorisés à tourner sur la plateforme
(fichiers `package.json` front + middle fournis). Ce plafond remplace
l'ancien budget « 1 runtime / 12 directes » (CLAUDE.md §2, désormais retiré).

Règle : **le SBOM est un plafond, pas une obligation.** On reste dans les
versions autorisées et on n'utilise que le strict nécessaire ; rien n'oblige à
adopter Tailwind/Radix/axios au seul motif qu'ils figurent dans la liste.
Toute dépendance **hors plafond** (un composant runtime supplémentaire sur la
plateforme) exige l'accord du référent technique, une ligne ici **et** un ADR.

## SBOM autorisé (plafond plateforme)

### Front — React / TypeScript / Vite, conteneurisé

| Catégorie | Composants autorisés |
|---|---|
| Vue | react, react-dom (**18.3**), react-router-dom (7) |
| Design system | tailwindcss (4), @tailwindcss/vite, @radix-ui/react-* (icons, slot, tooltip), lucide-react, class-variance-authority, clsx, tailwind-merge, next-themes, sonner, tw-animate-css |
| Réseau | axios |
| Stockage client | react-secure-storage |
| Outils (dev) | vite (7), @vitejs/plugin-react, typescript (~5.9), eslint (9) + typescript-eslint + plugins react-hooks/react-refresh, @types/*, globals |
| Runtime | Node `>=22.18 <24` |

### Middle — Node / Express / TypeScript, conteneurisé

| Catégorie | Composants autorisés |
|---|---|
| Serveur | express (5) |
| HTTP / sessions | cookie-parser, cors, jsonwebtoken |
| Config | dotenv, dotenv-expand |
| Outils (dev) | typescript (5.9), nodemon, ts-node, tsx, @types/* |

## Ce qui est réellement installé aujourd'hui (sous-ensemble du plafond)

À ce jour, **seuls `express` (+ `@types/express`), `react`/`react-dom` et la
chaîne de build (`vite`, `@vitejs/plugin-react`, `typescript`, `@types/*`) sont
installés** (voir les `package.json` + `package-lock.json`). `core/` est **sans
dépendance**. Les paquets d'authentification et de config sont autorisés mais
**pas encore installés** (l'auth est RP3).

| Paquet | Rôle | Statut |
|---|---|---|
| react, react-dom 18 | Front (couche de vue, CLAUDE.md §3) | **installé** ; *bundlé* au build (aucun node_modules livré côté front) |
| vite + @vitejs/plugin-react | Build front | **installé** (dev) |
| express (+ @types/express) | Middle — serveur HTTP ; la logique d'API existante s'y branche sans changement | **installé** (seule dépendance runtime du middle) |
| cookie-parser, cors | Middle — cookie JWT httpOnly ; CORS same-origin | **différé (RP3)** — pas installé (même-origine géré sans `cors` ; cf. `middle/app.ts`) |
| jsonwebtoken | Middle — jeton de session JWT | **différé (RP3)** — pas installé |
| dotenv (+ expand) | Middle — secrets (BD, sync) hors dépôt | **différé** — arrive avec `pg`/l'auth |
| typescript, @types/* | Dev — TypeScript strict | **installé** (dev) |
| eslint (+ plugins), nodemon / tsx / ts-node | Dev — style maison client ; exécution TS | **différé** — non requis (tests `node:test`, exécution `node middle/main.ts`) |

Tailwind, Radix, lucide, axios, react-secure-storage, sonner,
react-router-dom, etc. **sont autorisés mais pas encore employés** : le CSS
reste écrit à la main pour l'instant, adapté au design system plus tard
(CLAUDE.md §5) ; l'application est mono-vue (pas de routeur) ; axios reste
optionnel (le wrapper `fetch` existant suffit).

## Ressources embarquées (non-npm)

- **Polices DM Sans (variable 400–700) et DM Serif Display (400)** —
  fichiers `.woff2` (latin + latin-ext) embarqués dans
  `front/public/fonts/` et déclarés en `@font-face`. Licence SIL OFL
  (redistribution permise). Auto-hébergées pour respecter le zéro-egress :
  aucune police distante, aucun appel à Google Fonts à l'exécution.

## Hors plafond — non requis pour l'instant

| Paquet | Rôle | Statut |
|---|---|---|
| **`pg`** (node-postgres) | Client PostgreSQL du middle (port `BoardStorage`) | **Non requis pour la 1re mise en service** : le stockage **fichier JSONL durable** (volume persistant sauvegardé, middle mono-instance) est retenu — **zéro écart au plafond**. `pg` ne deviendrait à autoriser que si PostgreSQL s'impose (scaling horizontal du middle / exigence SGBD) ; il se branche alors derrière le port `BoardStorage`, sans autre changement. Client standard, mûr, JS pur (pas de build natif), auditable. |

## Modules natifs Node (aucune dépendance, dans tout plafond)

- `scrypt` de `node:crypto` — hachage des mots de passe (préféré à
  bcrypt/argon2, non listés et à compilation native).
- `node:test` — tests de `core/` et `middle/`, sans framework.

## Règles

- Versions épinglées aux versions autorisées du SBOM ; installation par
  `npm ci`.
- Pas d'ORM ; SQL paramétré, fin, derrière le port `BoardStorage`.
- Tout ajout hors plafond : accord référent + ligne ici + ADR.
- Pour des tests UI automatisés ultérieurs : **Vitest** (bâti sur Vite, déjà
  dans la stack) serait l'ajout naturel, à faire autoriser.
