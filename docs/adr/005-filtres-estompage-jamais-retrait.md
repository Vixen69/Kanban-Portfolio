# ADR 005 — Les filtres estompent, ils ne retirent jamais

## Contexte

Le Sprint 2 ajoute le panneau latéral : filtres par domaine, responsable,
bloqués, âge, et compteurs (CLAUDE.md §5, §10). Un filtre classique retire
les cartes du tableau ; mais l'instrument promet « tout le portefeuille
visible d'un coup, toujours » (§1) — un tableau filtré qui masque des
cartes ment sur l'état du flux (limites WIP, densité des colonnes).

## Décision

- Un filtre **estompe** (opacité 0,16) les cartes qui ne passent pas ;
  il n'en retire aucune. La structure spatiale — nombre de cartes par
  cellule, lecture WIP, hauteur du radiateur — reste exacte en permanence.
- Les compteurs structurels (en-têtes de colonnes, cellules, canaux
  repliés) restent calculés sur le portefeuille **complet**. Seuls la
  lecture « x / y affichés » et le bloc de statistiques du panneau
  distinguent sélection et total.
- La logique vit dans `core/filters.ts` (pur, testé) : état des filtres,
  prédicat, ensemble des cartes estompées, compteurs. L'UI
  (`ui/components/Sidebar.tsx`, `ui/useFilters.ts`) ne fait que lier les
  contrôles à cet état.
- Critères Sprint 2, combinés en ET : domaines (multi), responsable
  (unique), bloqués seulement, âge minimal dans la colonne (seuils issus
  de `agingStepsDays` — rien de câblé en dur).
- La recherche textuelle de la maquette n'est **pas** retenue : hors
  périmètre contractuel du Sprint 2 (« filters by domain, owner, blocked,
  age; counts »).

## Conséquences

- Filtrer ne peut jamais faire défiler ni recomposer le tableau : le
  critère « un écran » tient avec ou sans filtres.
- Le « vide » d'une sélection reste lisible : les cartes estompées
  continuent de porter la densité visuelle de chaque cellule.
- Si la recherche textuelle devient nécessaire, elle suivra le même
  principe (estompage) et fera l'objet d'une mise à jour de cet ADR.
