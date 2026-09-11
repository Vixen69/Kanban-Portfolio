# ADR 031 — Les filtres masquent, les colonnes comptent, plus de WIP provisoires

Date : 2026-09-11 · Statut : accepté (décision de l'auteur)

## Contexte

Depuis l'ADR 005 (repris en v12, CLAUDE.md §5), les filtres du panneau
latéral **estompaient** les cartes écartées sans jamais les retirer : la
structure spatiale du tableau restait la vérité. Devant le périmètre réel
(une centaine de projets, ADR 030), l'auteur constate que le grisé encombre
plus qu'il n'éclaire : « plutôt que de griser les cases non sélectionnées,
effacer et n'afficher que les projets filtrés ». Il demande en même temps
que chaque colonne dise combien de sujets le filtre retient, et que les
limites d'encours provisoires de `config/board.json` (valeurs de maquette,
jamais calibrées) disparaissent.

## Décision

1. **Les filtres masquent.** `core/filters.ts` expose `hiddenCardIds` (à la
   place de `dimmedCardIds`) ; la grille ne transmet aux cellules —
   dépliées comme repliées — que les cartes retenues. Le rendu « estompé »
   des cartes est retiré. Les totaux v12 (en-têtes, canaux, barre
   latérale) portaient déjà sur le visible : inchangés. La chaleur WIP
   d'une cellule se lit sur les cartes affichées.
2. **Les colonnes comptent.** L'en-tête de chaque colonne porte le nombre
   de sujets de la colonne ; quand le tableau est filtré, il devient
   « retenus/total » (couleur d'accent) — le pendant, par stade, du chip
   « Filtré : x/y » de l'en-tête.
3. **Plus de WIP provisoires.** `wip: null` sur toutes les colonnes du
   modèle par défaut : les cellules montrent le compte nu, aucune alerte.
   Le mécanisme reste (panneau d'administration, ADR 013) ; les limites se
   calibreront sur le flux réel, comme prévu depuis le départ.

## Conséquences

- L'ADR 005 est retirée sur ce point ; CLAUDE.md §5 et le README le disent.
- Un filtre sans résultat vide le tableau (les colonnes affichent « 0/N »,
  le chip « Filtré : 0/150 » reste dans l'en-tête, Échap réinitialise).
- Le glisser-déposer sur une cellule filtrée insère avant une carte
  visible ; l'ordre manuel des cartes masquées n'est pas touché.
- Fichiers : `core/filters.ts` (+ tests), `core/totals.ts` (nommage),
  `front/App.tsx`, `front/components/BoardGrid.tsx` (`ColumnHeads`,
  filtrage par cellule, compte), `Cell.tsx`, `cards.tsx`, `styles/*.css`,
  `config/board.json`.
