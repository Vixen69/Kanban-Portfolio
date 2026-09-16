# ADR 039 — Demandes et Qualification sans canal : la qualification, c'est le geste

Date : 2026-09-16 · Statut : accepté (décision de l'auteur, maquettes validées le soir)

## Contexte

La qualification d'un projet se fait à la RDO, au fil de l'eau en atelier
d'architecte, tout au long de la colonne Qualification. Avant cette porte,
un projet n'est ni petit, ni compliqué, ni complexe : il est unique. Le
tableau le découpait pourtant en trois canaux dès Demandes. L'auteur veut
Demandes et Qualification en bandes uniques, les trois canaux à partir
d'Études, et surtout ne rien perdre des totaux : « ma seule angoisse, c'est
ce truc des totaux ». Ses croquis ont fixé la forme : une gouttière de
totaux à gauche de Demandes, une seconde gouttière de canaux, avec son
propre Σ, entre Qualification et Études ; Pause reste entre Études et
Actifs, découpée en canaux.

## Décisions

1. **Les colonnes jusqu'à la RDO n'ont pas de canal.** Elles se déduisent
   de la config (`core/layout.ts` `unifiedColumnIds`) : toutes les colonnes
   jusqu'à l'ancre de qualification (« qualification », sinon la deuxième
   colonne), jamais codées en dur — l'admin peut renommer ou déplacer la
   colonne. Chaque colonne unifiée est **une cellule haute comme le
   tableau**, sans étiquette (« à qualifier », « RDO en cours » n'existent
   pas : dans Demandes on n'est pas qualifié, dans Qualification on est en
   train de l'être, et la RDO clôt).
2. **Deux gouttières.** À gauche de Demandes, la gouttière du **tableau
   entier** : nombre de projets, meilleur estimé et reste à faire de tout
   ce qui est affiché, Demandes, Qualification et les trois canaux d'après
   — jamais une liste de projets, les cartes commencent en Demandes. Son Σ,
   en haut à gauche, déplie les totaux par colonne comme avant (la
   gouttière s'élargit avec). Entre Qualification et Études, la gouttière
   des **canaux** avec leur Σ↓ : Projets compliqués, Petits projets,
   Projets complexes, chacun avec ses totaux, **comptés à partir d'Études**
   (une carte encore en Demandes ou Qualification ne compte dans aucun
   canal, son canal n'est pas montré). Les en-têtes de colonnes gardent
   leurs propres totaux.
3. **Aucun changement de modèle.** Toute carte garde un `laneId` (l'import
   met tout dans le canal « compliqué », Q3). Dans une colonne unifiée,
   l'affichage l'ignore. **La qualification est le geste** : glisser une
   carte d'une cellule unifiée vers une cellule d'Études dans le canal
   choisi — un seul évènement `moved`, comme aujourd'hui. Déposer une carte
   dans une cellule unifiée (retour en Qualification, ou passage de
   Demandes à Qualification) lui **garde son canal** (`UNIFIED_LANE`) :
   elle remontera au même endroit, et un dépôt sur une autre carte de la
   cellule ne change pas non plus son canal — un changement de canal
   dans la même colonne compterait comme une entrée d'étape (ADR 019).
4. **Replis.** Replier un canal replie ses cellules à partir d'Études, les
   cellules unifiées suivent la hauteur restante. Replier une colonne
   unifiée la réduit à sa languette, haute comme le tableau. Le focus d'une
   colonne unifiée montre ses cartes étendues. La limite WIP lue sur une
   cellule unifiée est celle de la colonne entière (canaux × limite).

## Conséquences

- `core/layout.ts` (`UNIFIED_LANE`, `unifiedColumnIds`, `columnTemplate` à
  deux gouttières) + tests ; `front/components/UnifiedZone.tsx` (nouveau :
  `BoardGutter`, `LaneCorner`, `UnifiedCells`), `BoardGrid.tsx` (les canaux
  ne rendent que leurs colonnes ; totaux de canal hors colonnes unifiées ;
  total du tableau), `Cell.tsx` (`laneId`, `wipLimit`, `style`),
  `ColumnHeads.tsx` (`columns`), `CollapsedCells.tsx` (`style`),
  `BoardTotals.tsx` (`TotalsToggle`), `useInteractions.ts` (dépôt dans une
  cellule unifiée = canal conservé), `board.css`.
- Le critère « une seule page » se mesure comme avant ; la hauteur d'une
  cellule unifiée est la somme des lignes de canaux.
- « + Sujet » ne demande plus de canal quand la colonne d'entrée n'en a pas
  (nettoyage demandé par l'auteur le soir même) : l'intent part sans
  `laneId`, le serveur prend le canal « compliqué » comme l'import, et la
  qualification choisira le vrai canal par le geste.
