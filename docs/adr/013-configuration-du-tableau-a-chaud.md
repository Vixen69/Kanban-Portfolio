# ADR 013 — Configuration du tableau à chaud (panneau d'administration)

## Contexte

La maquette validée v9 comporte un panneau « Configuration du tableau »
(onglets Structure / Catégories / Champs de carte). Le contrat disait
jusqu'ici : « la topologie vit dans un fichier de configuration versionné.
Il n'y a pas d'UI de réglages » (CLAUDE.md §1). Le PO a validé la maquette
qui inclut ce panneau : le conflit est tranché en faveur de la maquette,
en préservant l'esprit de la règle — **seule la topologie est
configurable, le comportement reste câblé**.

## Décision

- **Périmètre strict du panneau** : colonnes (ordre, nom, WIP, gate),
  canaux (ordre, nom, sous-titre nature), domaines RDOM (nom, code,
  couleur), types de projet, libellés des natures (clés fixes, non
  extensibles) et des criticités, champs de carte personnalisés
  (texte/nombre/date/liste/case/personne, badge optionnel). Aucun
  comportement produit n'y est réglable (pull, âge visible, blocage,
  un-écran : câblés).
- **Persistance côté middle** : `PUT /api/config` valide
  (`validateBoardConfig`) puis écrit l'override dans `data/config.json`
  et ajoute une ligne `{ts, actor, config}` à l'historique **append-only**
  `data/config-history.jsonl`. `GET /api/config` sert l'override s'il
  existe, sinon le modèle par défaut.
- **`config/board.json` reste le modèle NMO par défaut, versionné en
  git** : « Réinitialiser le modèle » (`GET /api/config/default`) y
  revient toujours. Le fichier n'est jamais réécrit par l'application.
- **Aucune réécriture d'événements** lors d'un changement de config : une
  carte dont la colonne/le canal/le domaine/le type a disparu est
  réaffectée **à l'affichage** (`reconcileCardRefs`, repli sur la première
  entrée). Le journal reste la vérité intacte.
- **Accès** : panneau destiné au rôle admin ; le verrouillage effectif
  arrive avec l'authentification (RP3). D'ici là, l'historique de config
  trace chaque application.

## Conséquences

- CLAUDE.md §1 doit être amendé : « pas d'UI de réglages » devient « une
  UI d'administration de la topologie uniquement, réservée à l'admin ».
- L'audit de configuration est séparé du journal des cartes (deux
  historiques, deux natures de vérité).
- Sur PostgreSQL (une fois `pg` autorisé), l'override et son historique
  deviennent une table `config_versions` append-only — même modèle.
- Les tests de validation de config sont la barrière contre une topologie
  dégénérée (0 colonne, ids en double, seuils incohérents).
