# ADR 017 — Archivage des sujets par évènements

## Contexte

Le design v11 (2026-07-09) introduit l'**archivage** : retirer un sujet du
tableau **sans le supprimer** — bouton « Archiver » sur la fiche, vue
« Archives » (recherche, « Désarchiver », ouverture de la fiche), badge
compteur dans l'en-tête. Le prototype Claude Design pose un simple drapeau
`archived: true` muté côté client ; dans le produit, le journal d'évènements
est la vérité (ADR 002) et la suppression est déjà elle-même un évènement
(ADR 012). L'archivage doit suivre le même modèle.

## Décision

- **Deux nouveaux types d'évènements** : `archived` / `unarchived`, au même
  rang que `blocked`/`unblocked` — append-only, horodatage/acteur côté
  serveur, validés par le middle (400 « Carte déjà archivée. » / « Carte non
  archivée. » si l'état courant ne s'y prête pas).
- **Repli à la lecture** : contrairement à `deleted` (la carte disparaît du
  fold), une carte archivée **reste dans le fold** avec `archived: true` — la
  vue Archives la liste et sa fiche reste ouvrable. C'est le **front** qui
  l'exclut du plateau et de **tous** les compteurs (`activeCards` =
  non archivées ; en-tête, sidebar, métriques et grille ne voient qu'elles).
- **Aucun changement de schéma** : les évènements sont des lignes `jsonb`
  (Postgres) / JSON (JSONL) ; le type `archived` n'exige ni colonne ni
  migration. Les cartes de base n'ont pas de champ `archived` — l'état est
  entièrement dérivé du journal.
- **Échappement clavier** : la vue Archives s'insère dans l'ordre de
  déroulement d'Escape — fiche → ajout → archives → panneau → focus → canaux
  repliés (design v11).

## Conséquences

- L'audit trail raconte l'archivage comme le blocage : qui, quand, réversible.
- Les métriques de flux restent calculées sur les cartes actives ; un sujet
  archivé ne pollue ni les compteurs ni le radiateur, mais son historique
  complet reste dans le journal.
- Rejouabilité totale : les journaux existants (sans évènements d'archivage)
  se replient inchangés, `archived` valant `false` par défaut.
