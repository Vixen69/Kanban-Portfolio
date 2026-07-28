# ADR 020 — Design v12 : totaux d'agrégats et lecture de gouvernance

## Contexte

Le design v12 (2026-07-28) déplace le centre de gravité de l'outil : jusqu'ici
le tableau racontait le **flux** (où ça avance, où ça stagne) ; il doit aussi
porter l'**argent** et la **capacité**, parce que le Portfolio Sync arbitre sur
ces deux axes. La maquette validée ajoute des totaux agrégés dans la
gouttière du tableau (par colonne et par canal), remplace intégralement la vue
Métriques par une lecture de gouvernance, ajoute un filtre « Contrainte », et
allège la fiche et la carte en focus.

Quatre points n'avaient pas d'équivalent produit et ont été arbitrés par
l'auteur (2026-07-28) : la base de la limite d'encours cumulée, le sort des
diagnostics de flux supprimés, le sort de la note de colonne, et l'état dans
lequel se mesure le critère « une seule page ».

## Décision

- **Les totaux sont une agrégation unique** (`core/totals.ts`) : enveloppe
  RDLI, meilleur estimé, engagé, réalisé (k€), plan de charge et consommé
  (j.h) avec leur ventilation par profil. L'en-tête de colonne, l'étiquette
  de canal et la vue Metrics lisent **la même arithmétique** — ils ne peuvent
  pas diverger. L'agrégat porte sur les cartes **visibles** : les cartes
  estompées par les filtres sont exclues, l'archivage reste de la
  responsabilité de l'appelant (contrat inscrit dans la doc du module).
- **Deux bascules Σ**, mémorisées par navigateur (`localStorage`,
  `front/useUiPrefs.ts`). C'est la **première persistance côté client** du
  produit : deux booléens de confort, jamais de donnée de portefeuille,
  chaque accès protégé — un navigateur sans stockage retombe sur les
  défauts. Interdit à `core/`, qui reste sans DOM.
- **Le critère « une seule page » se mesure en mode compact** (l'état par
  défaut). `LAYOUT.columnHeadHeight` passe de 38 à **65 px**, mesuré dans
  l'application. Les totaux dépliés (~230 px d'en-tête) et la gouttière
  élargie (`LANE_GUTTER.expanded`, 176 px) sont un **zoom volontaire** qui
  peut défiler ; la liste des profils est plafonnée et défilante. Par
  cohérence avec cet arbitrage, les totaux de colonne sont **repliés par
  défaut** — la maquette les ouvrait, ce qui portait l'en-tête à 230 px et
  cassait le critère §5.
- **La limite d'encours cumulée = nb de canaux × `colonne.wip`.** La maquette
  somme des limites par canal×colonne stockées en `localStorage` ; le produit
  n'a que `columns[].wip`, topologie éditable par l'admin (ADR 013), appliquée
  cellule par cellule. Le produit de la limite par le nombre de canaux est
  exactement la limite de la colonne entière.
- **Les étapes terminales sont dérivées de la config**, jamais codées en dur.
  `terminalColumnIds()` (`core/flow.ts`) rend la colonne d'ancrage terminal et
  toutes les suivantes — le même ancrage que les Délais de la fiche, donc la
  fiche et les métriques ne peuvent pas se contredire. La maquette codait
  `['done','exploitation']`, ce qui aurait mis le débit à zéro au premier
  renommage de colonne.
- **Les diagnostics de flux de la v11 sont abandonnés** (décision auteur) :
  `computeFlowMetrics`, `stageDurations`, le temps moyen par étape, la
  composition d'âge et le **goulot principal** disparaissent. La v12 est
  explicitement une lecture de gouvernance, pas un diagnostic de flux. Le
  principe de l'ADR 007 est **inchangé** — les métriques restent des requêtes
  sur le journal, sans magasin séparé ; seule sa surface change. L'ADR 007
  n'est donc pas annulé, il est amendé sur son inventaire de panneaux.
- **La note de colonne passe en infobulle** de l'en-tête : les totaux ont pris
  sa ligne, mais `Column.note` reste dans le modèle et éditable dans le
  panneau admin — pas de champ orphelin.
- **Le filtre « Contrainte »** est OU-formé : une carte reste allumée tant
  qu'**une** de ses contraintes est active. La pastille « Aucune » filtre
  l'**absence** de contrainte ; elle n'est pas une contrainte, donc elle vit
  dans un champ propre (`FilterState.noConstraint`) et non comme clé de la
  table — aucun identifiant admin ne peut entrer en collision avec elle.
  Libellés et couleurs viennent de la config (vocabulaire éditable, ADR 013).
- **La fiche perd le canal** (bandeau de tags et ligne du chef de projet) et
  la carte en focus troque sa barre de progression contre « est. k€ · RAF
  j.h ». Le canal est déjà lu spatialement, dans la ligne du tableau ; la
  barre mélangeait deux unités sur une même piste.
- **Les fixtures** tirent désormais la contrainte projet en un jet pondéré
  (28 % légale, 24 % groupe, 8 % les deux, 40 % aucune) au lieu d'un mélange
  uniforme 0-2.

## Conséquences

- Le tableau répond à « combien ça coûte et qui est saturé » sans quitter
  l'écran, et la vue Metrics devient exploitable en comité.
- **Coût mesuré du bandeau de totaux** : l'en-tête passant de 38 à 65 px, une
  ligne perd 9 px de part égale et **une barre visible** (17 → 16). Sur le jeu
  de fixtures épinglé, la cellule la plus pleine (19 sujets) écrête donc
  **3 barres au lieu de 2** ; le test d'acceptation
  (`adapters/fixtures/acceptance.test.ts`) a été recalibré de 2 à 3, avec la
  raison inscrite en tête de fichier. La borne « le contenu tient dans
  l'écran » est **inchangée** et passe toujours ; une cellule trop pleine
  porte la flèche de défilement, par conception. Vérifié en application à
  1920×1080 : aucun défilement de page, aucune cellule en débordement.
- `core/metrics.ts` est réécrit et scindé (`core/metrics-flow.ts`) ;
  `front/components/MetricsView.tsx` est scindé (`metricsPanels.tsx`), et
  `BoardGrid.tsx` a essaimé `BoardTotals.tsx` et `CollapsedCells.tsx` — les
  plafonds 300 lignes / 40 lignes tiennent partout.
- Le jet de contrainte consomme **un** tirage aléatoire au lieu de deux : tous
  les sujets postérieurs voient leurs extras (risques, contention, RDR)
  décalés. Le déterminisme de l'ADR 003 est préservé (même graine, même
  sortie), mais les valeurs concrètes changent. Les positions, âges, quotas de
  blocage et financiers sont tirés **avant** et restent identiques.
- Les nouvelles fixtures ne sont visibles qu'après **réamorçage** du magasin
  (`seed.ts` est idempotent) : supprimer `data/board.jsonl` puis `npm start`,
  ou `docker compose -f docker/compose.yaml down -v` puis relancer.
  ⚠ `down -v` supprime aussi le volume de configuration, donc toute surcharge
  admin.
- Une fiche ouverte depuis les Archives n'affiche plus son canal nulle part —
  régression assumée du design v12, à confirmer avec les utilisateurs PMO.
- Aucun changement de schéma, de migration ni de code `middle/` : les champs
  agrégés existaient déjà et la vue est une lecture.
