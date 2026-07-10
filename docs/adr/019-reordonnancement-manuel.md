# ADR 019 — Réordonnancement manuel des cartes, par évènements

## Contexte

Le design v11 (2026-07-09) permet de déposer une carte **sur une autre
carte** : la carte glissée s'insère juste avant la cible, dans la cellule de
la cible (indicateur d'insertion bleu pendant le survol). Le prototype
réordonne un tableau local ; le produit n'avait **aucune représentation de
l'ordre manuel** — l'ordre des cartes était l'ordre d'insertion des cartes de
base, préservé par le repli. Deux règles existantes s'y opposaient
frontalement : le middle refusait tout déplacement même-cellule (« Carte déjà
dans cette cellule ») précisément parce que tout évènement `moved`
réinitialisait l'horloge d'âge. L'auteur a arbitré : adoption fidèle,
event-sourcée.

## Décision

- **L'ordre vit dans le journal** : l'évènement `moved` gagne un
  `payload.beforeId` optionnel — « insérer juste avant cette carte ». Le
  repli maintient un ordre global des cartes (initialisé à l'ordre des
  cartes de base) et rejoue chaque `beforeId` par re-insertion ; les
  cellules lisent cet ordre (`cellCards` le préserve). Cible inconnue ou
  auto-référence : ordre inchangé, le replay ne casse jamais.
- **Un déplacement même-cellule n'est accepté QUE comme réordonnancement**
  (`beforeId` présent) ; sans lui, le middle refuse toujours (« Carte déjà
  dans cette cellule »). Le `beforeId` est validé contre le plateau replié :
  il doit désigner une **autre** carte, **dans la cellule visée**.
- **Un réordonnancement ne touche pas au flux** : même-cellule ⇒ l'horloge
  d'âge (`enteredColumnAt`) ne se réinitialise PAS (la carte a changé de
  rang, pas d'étape) ; l'historique de la fiche ne le raconte pas ; les
  métriques d'étape (`stageDurations`, délais/lead/cycle) l'ignorent — un
  séjour n'est jamais scindé par un simple reclassement.
- **Un déplacement inter-cellules avec `beforeId`** (dépôt sur une carte
  d'une autre cellule) reste un vrai mouvement : changement de cellule,
  horloge réinitialisée, narré dans l'historique — plus le positionnement.
- Aucun changement de stockage : `beforeId` voyage dans le payload `jsonb`
  (Postgres) / JSON (JSONL) existant.

## Conséquences

- L'ordre vertical d'une cellule devient une information de gouvernance
  (priorité visuelle au Portfolio Sync), auditée comme le reste : qui a
  reclassé quoi, quand.
- Les journaux antérieurs (sans `beforeId`) se replient exactement comme
  avant ; un dépôt sur cellule (sans cible) conserve la position de la
  carte dans l'ordre global, comme le prototype.
- Le geste ajoute une sémantique permanente au journal ; c'est le prix
  accepté (décision auteur, 2026-07-09) pour que le radiateur reflète la
  priorité réelle sans champ « priorité » à maintenir.
