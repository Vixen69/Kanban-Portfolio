# Dépendances — budget et justification

Budget (CLAUDE.md §2) : **1 dépendance runtime maximum** (réservée au
serveur : `node:sqlite` ou `better-sqlite3`, décision au Sprint 3) et
**12 dépendances directes maximum**, devDependencies comprises.

État : **8 / 12** dépendances directes. **0 / 1** dépendance runtime serveur.

Note d'interprétation (voir ADR 001) : `react` et `react-dom` figurent dans
`dependencies` au sens npm, mais sont compilées dans le bundle statique au
build — au runtime, le serveur ne charge aucun module tiers. Le budget
« runtime » vise le processus serveur.

| Paquet | Version | Type | Justification |
|---|---|---|---|
| react | 19.2.7 (exacte) | bundle UI | Couche de vue imposée par la stack (CLAUDE.md §3). Composants fonctionnels uniquement. |
| react-dom | 19.2.7 (exacte) | bundle UI | Rendu DOM de React, indissociable de react. |
| typescript | 6.0.3 (exacte) | dev | TypeScript strict partout (CLAUDE.md §3). |
| vite | 8.0.16 (exacte) | dev | Outil de build imposé par la stack. Build hors-ligne reproductible. |
| @vitejs/plugin-react | 6.0.2 (exacte) | dev | Transformation JSX pour Vite. |
| @types/react | 19.2.17 (exacte) | dev | Typage de react. |
| @types/react-dom | 19.2.3 (exacte) | dev | Typage de react-dom. |
| @types/node | 25.9.3 (exacte) | dev | Typage de `node:test` / `node:fs` pour les tests et scripts. |

## Règles

- Toute addition exige une ligne justifiée ici **et** un ADR.
- Versions épinglées exactes ; installation par `npm ci` uniquement.
- Pas de framework de test (tests sur `node:test`, natif Node 24).
- Pas d'outil SBOM tiers (`scripts/sbom.ts` est maison).
- Le lint de complexité attend la décision « style maison de l'équipe
  cliente » (CLAUDE.md §12) ; en attendant, `scripts/check-conventions.ts`
  fait respecter les plafonds fichier/fonction sans dépendance.
