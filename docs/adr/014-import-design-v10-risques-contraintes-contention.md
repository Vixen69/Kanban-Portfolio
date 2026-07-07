# ADR 014 — Import design v10 : couche risques / contraintes / contention

## Contexte

Une version postérieure de la maquette Claude Design (« Portefeuille DSI —
Kanban NMO ») a été validée par l'auteur et importée (bundle HTML
auto-contenu ; sources JSX extraites de son manifest gzip+base64, réécrites
dans `design/` pour un diff propre). Le delta vs la v9 (ADR 012) concentre
l'ajout dans la **fiche détail** : une couche **risques / contraintes projet /
contention de ressources / plan de charge par profil**. Le plateau ne change
(quasi) pas — hors une couronne/étoile de criticité. Ces éléments sont du
**vocabulaire et des champs de carte**, pas un nouveau comportement (l'opinion
produit du §1 reste câblée).

## Décision

- **9 nouveaux champs de carte** (aucune suppression) : `risks`
  (`{type, desc}`), `projectConstraints` (ids), `contentionProfiles` +
  `contentionNote`, `chargeByProfile` (`{profileId, jh, done}`), `alerts`,
  `dateRdr`, `budgetRdli` (enveloppe RDLI arbitrée) et `budgetEngaged`
  (engagé). RDLI/engagé sont portés par la carte/`Subject` — ce sont des
  valeurs d'arbitrage, **pas** des financiers PPM standards (le port
  `Financials` reste `{budget, consumed, remaining}`).
- **Nouvelles typologies = membres de plein droit de `BoardConfig`**
  (choix auteur « fully overridable ») : `profiles` (19, DSI), `roleFamilies`,
  `roleOf`, `riskTypes`, `projectConstraints`, `riskSeverity`. Ajoutées à
  `config/board.json`, validées par `core/config.ts`, servies par
  `/api/config`. Le panneau admin clone la config entière → elles **transitent
  inchangées** dans une surcharge (round-trip sûr) ; leur édition dédiée dans
  l'UI admin est une évolution ultérieure, pas une exigence de justesse.
- **Édition** : les champs sont éditables **en ligne** dans la fiche (pas dans
  le formulaire complet), via des évènements `edited` ; la liste blanche
  (`EDITABLE`, `core/state.ts`) et la validation **config-aware** du middle
  (ids de profil/risque/contrainte vérifiés contre la topologie) les couvrent.
- **Fixtures** : semis déterministe des 9 champs en **passe finale** (tirages
  RNG **après** toute position/âge) — la grille du plateau et les âges par
  carte restent **identiques** au prototype (pin S002 vert).
- **Découpes** imposées par les plafonds (fichier ≤ 300 / fonction ≤ 40) :
  `core/types.ts` → `config-types.ts` ; primitives de validation →
  `config-parse.ts` ; semis fixtures → `adapters/fixtures/extras.ts` ;
  dérivations fiche → `front/detailModel.ts`.

## Conséquences

- CLAUDE.md §4 (table `cards`) et §5 sont à amender pour lister les 9 champs
  et les nouvelles typologies (fait dans le même lot que cette ADR).
- La validation middle **rejette** un id de profil/risque/contrainte hors
  topologie ; les éditeurs front sèment depuis la config (les ids obsolètes
  sont abandonnés à l'ouverture) — cohérent avec `reconcileCardRefs` (ADR 013).
- Sur PostgreSQL (ADR 011), ces champs deviennent des colonnes `jsonb` ; aucun
  nouveau type d'évènement (toujours `edited`).
- Revue adversariale multi-agents (5 dimensions) passée : 1 correctif appliqué
  (éditeurs contention/contrainte). 263 tests verts, vérifié en navigateur.
