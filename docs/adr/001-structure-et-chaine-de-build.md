# ADR 001 — Structure du dépôt et chaîne de build

> **Note (ADR 011)** : la *chaîne de build* d'origine (node:http / SQLite,
> vendoring hors-ligne) est **re-plateformée** par l'ADR 011 (conteneurs,
> workspaces npm, livraison par image — ADR 015). La disposition ports &
> adaptateurs et l'event-sourcing (ADR 002) subsistent.

## Contexte

Le contrat (CLAUDE.md) impose : TypeScript strict, React + Vite en couche de
vue mince, logique métier dans des modules TS purs, budget de dépendances
serré, build vérifiable hors-ligne sur deux machines, Node LTS épinglé.

## Décision

- **Node 24 LTS** épinglé (`.nvmrc`, `engines`). Son retrait natif des types
  (`type stripping`) permet d'exécuter les tests `.ts` avec `node --test`
  sans aucun framework de test ni transpileur. En conséquence, le code
  utilise une syntaxe TypeScript « effaçable » (`erasableSyntaxOnly`) :
  pas d'enums, pas de namespaces, pas de paramètres de propriétés.
- **Un seul package.json** à la racine ; Vite a pour racine `ui/` et
  produit `dist/`. `core/` et `adapters/` sont importés directement par
  l'UI (extensions `.ts` explicites, requises par Node pour les tests).
- **Dépendances : 8/12**, versions exactes (voir DEPENDENCIES.md).
  Interprétation du « budget runtime = 1 » : il vise le processus serveur
  (le futur better-sqlite3 si node:sqlite ne convient pas). `react` et
  `react-dom` sont des dépendances de bundle, compilées dans les assets
  statiques ; aucun module tiers n'est chargé au runtime.
- **Lint** : en l'absence de la décision « style maison client » (§12),
  pas d'ESLint (qui exigerait 2 à 3 dépendances de plus pour parser du TS).
  `scripts/check-conventions.ts` (zéro dépendance) fait respecter les
  plafonds : 300 lignes/fichier, 40 lignes/fonction. Le plafond de
  complexité cyclomatique rejoindra le lint retenu.
- **Scripts d'outillage en TypeScript** (`scripts/*.ts`), exécutés
  directement par Node (type stripping) et inclus dans le typecheck —
  « TypeScript everywhere » s'applique aussi à l'outillage.
- **verify.sh** enchaîne install (hors-ligne si `vendor/` est peuplé),
  conventions, typecheck, tests, build, SBOM — dans cet ordre.

## Conséquences

- Aucun outillage à installer en plus de `npm ci` ; la machine client
  rejoue exactement la même chaîne.
- La montée de version de Node est un événement géré (mettre à jour
  `.nvmrc`, `engines`, re-vérifier le type stripping).
- Si le canal d'entrée du code côté client impose « zéro toolchain »
  (décision ouverte §12), `core/` reste portable : TS effaçable, aucune
  API Node, aucune dépendance.
