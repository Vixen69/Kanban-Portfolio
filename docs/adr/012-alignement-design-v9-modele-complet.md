# ADR 012 — Alignement design v9 : modèle de carte complet, nouveaux événements

## Contexte

La maquette validée v9 (`design/`, « Portefeuille DSI — Kanban NMO ») est
désormais la référence produit. L'ADR 006 avait volontairement laissé hors
périmètre : commentaires, ressources clés, plan de charge, charge en
jours-homme, édition complète, création locale, notes, référence Sciforma,
gates DoR/DoD. La maquette v9 valide tous ces éléments — le PO a demandé
la reconstruction fidèle (« the true version of the tool »).

## Décision

- **Carte étendue** : `nature` par carte (clé fixe simple/complicated/
  complex, libellés configurables), `effortEstimated`/`effortConsumed`
  (jours-homme), `budgetEstimated`/`budgetConsumed` (k€) — remplacent le
  triplet `budget/consumed/remaining` (le restant est dérivé) —,
  `loadPlan` (plan de charge), `resources` (ressources clés), `notes`,
  `sciformaId`, `custom` (valeurs des champs personnalisés). ⚠️ CLAUDE.md
  §4 à amender.
- **Deux nouveaux types d'événements** : `commented` (les commentaires
  d'une carte sont une **projection du journal**, jamais une colonne) et
  `deleted` (la suppression est **elle-même un événement** ; le journal
  reste append-only, le fold exclut simplement la carte). L'événement
  `edited` porte la liste blanche étendue (`CardPatch`).
- **Création locale** (« + Sujet ») : `POST /api/cards`, source
  `"manual"` (ajoutée à l'énumération), entrée systématique dans la
  première colonne (flux tiré : tout arrive par la gauche).
- **Modèle d'âge** : catégories frais/récent/vieillit/stagnant
  (seuils 7/28/60 j en config) remplacent `agingStepsDays`. Le style
  validé porte l'âge par la **pastille texte** (3j/2s/4m, orange puis
  rouge) — pas d'assombrissement du fond par défaut (`decayAlpha` reste
  en `core/` pour les métriques et une éventuelle réactivation).
- **WIP actifs** (7/6/7/5/–/6/6/–), avertissement à ≥ 80 %, dépassement
  au-delà de 100 % — signal, jamais blocage. Gates DoR (Prêts) et DoD
  (Done) : badge + liseré, décision humaine, aucune contrainte logicielle.
- **Colonne « Pause »** ajoutée (repliée par défaut, repli de pilotage).
- **Fixtures : 150 sujets**, portage exact du générateur de la maquette
  (seed 20260609) ; l'historique de mouvements est émis en événements
  (`imported`/`moved`/`blocked`/`commented`, acteur « sciforma-sync »,
  commentaires signés des chefs de projet).

## Conséquences

- Les adaptateurs réels (csv, Sciforma) mapperont ou laisseront nuls les
  nouveaux champs (mapping §12 toujours ouvert).
- Le critère « un écran » est vérifié avec 150 cartes (densité 16 px).
- La maquette v9 ne rend pas de marqueur d'escalade Andon dédié sur la
  carte (le seuil reste en config et en `core/aging.isAndon`) — écart
  signalé au PO, à trancher à la prochaine itération design.
- RP3 fera transiter l'acteur authentifié aussi sur `commented`/`deleted`.
