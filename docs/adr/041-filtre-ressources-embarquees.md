# ADR 041 — Le filtre « Ressources embarquées » : les projets qui prennent des jours à A&D ou INFRA

Date : 2026-09-17 · Statut : accepté (demande de l'auteur)

## Contexte

Les responsables de domaine A&D et INFRA arbitrent sur ce qui leur prend
des jours, quel que soit le domaine porteur du projet. La vue capacité le
montre déjà (« cartes qui pèsent », ADR 033) mais rien ne permettait de
**réduire le tableau** à ces projets. L'auteur veut un filtre dans les
filtres : « les projets qui embarquent de la ressource A&D ou INFRA ».

## Décisions

1. **La lecture** (`core/resource-draw.ts` `resourceDrawByDomain`) : pour
   chaque domaine `transverse` de la config, l'ensemble des cartes qui lui
   prennent des jours — les personnes nommées du domaine par les
   affectations du plan de charge, plus les lignes génériques du domaine ;
   une ligne à zéro jour ne compte pas. La même lecture que « cartes qui
   pèsent », réduite à oui/non par carte. Sans snapshot importé, des
   ensembles vides.
2. **Le filtre** (`core/filters.ts`, groupe `resource`) est **opt-in**,
   contrairement aux autres groupes : toutes les pilules éteintes par
   défaut ; une pilule allumée ne garde que les cartes qui prennent des
   jours à ce domaine, OU entre pilules allumées. `cardMatches` et
   `hiddenCardIds` reçoivent la lecture (`ResourceDraw`) ; sans lecture,
   une pilule allumée ne garde rien — dit, pas deviné. Le chip « Filtré »
   et « Réinitialiser » le prennent en compte.
3. **L'écran** : une section « Ressources embarquées » dans la barre de
   filtres (`sidebarParts.tsx` `ResourceSection`), une pilule par domaine
   transverse avec sa couleur et le nombre de cartes de l'exercice qui lui
   prennent des jours ; tout / rien comme les autres groupes. Absente si la
   config ne déclare aucun domaine transverse.
4. **Le snapshot de capacité est lu une fois par l'application**
   (`front/useCapacity.ts` `useResourceDraw`) pour l'exercice affiché : le
   filtre et l'onglet Capacité des analytics partagent la même lecture ;
   un import la rafraîchit, une action sur une carte non.

## Conséquences

- `core/resource-draw.ts` (+ tests), `core/filters.ts` (`resource`,
  `ResourceDraw`, `resourcePasses`), `front/useFilters.ts` (réconciliation
  opt-in), `front/useCapacity.ts` (nouveau, le hook sorti de
  `CapacityView.tsx`), `front/useDisplayCards.ts` (`useDerived` sorti
  d'`App.tsx`), `App.tsx`, `AnalyticsView.tsx`, `CapacityView.tsx`,
  `Sidebar.tsx`, `sidebarParts.tsx`, `sidebar.css`.
- Le filtre suit l'exercice affiché et les cartes retenues alimentent les
  totaux des en-têtes et des canaux comme tout autre filtre (ADR 031).
