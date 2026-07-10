# ADR 018 — Nature positionnelle : la nature d'un sujet EST son canal

## Contexte

Le design v11 (2026-07-09) retire le sélecteur « Nature » des formulaires
(édition et création) : la nature suit le canal (projets → compliqué, petits
projets → clair, projets complexes → complexe). L'auteur a tranché plus
nettement encore : **la nature n'est pas une étiquette, c'est un placement**.
Requalifier un sujet, c'est le déplacer vers un autre canal — jamais éditer
un champ. Le prototype codait ce lien en dur sur les ids de canaux
(`NATURE_BY_CANAL`), fragile face à la topologie administrable (ADR 013).

## Décision

- **`lanes[].natureKey`** (`simple` | `complicated` | `complex`) entre dans le
  modèle de configuration (`config/board.json`, validé par
  `core/config.ts`, édité dans le panneau admin). Absent, il vaut
  `complicated` (rétro-compatibilité des overrides déjà persistés). Le champ
  `nature` du canal reste le **sous-titre libre** d'affichage.
- **La nature n'est plus éditable** : retirée de `CardPatch`, de la liste
  `EDITABLE` du fold (un patch historique la visant est ignoré au replay —
  exactement la sémantique positionnelle) et des validateurs du middle
  (un patch `nature` est refusé « Champ d'édition non autorisé »).
- **À la création**, le serveur dérive la nature du canal
  (`laneNature(config, laneId)`) ; le client n'envoie plus de nature.
- **À l'affichage**, le front dérive la nature du canal courant
  (`useDisplayCards`) — un sujet déplacé vers un autre canal change de
  nature immédiatement, y compris par glisser-déposer. La valeur stockée sur
  la carte n'est qu'un instantané d'import ; elle ne gagne jamais.
- Les fixtures dérivaient déjà la nature du canal (invariant testé) —
  inchangées.

## Conséquences

- Le vocabulaire « Clair / Compliqué / Complexe » reste configurable
  (libellés/couleurs), mais la **position fait foi** : plus aucune
  incohérence possible entre le canal d'un sujet et sa nature affichée.
- Le filtre « Nature » de la sidebar disparaît (design v11) — filtrer par
  nature revient à lire les canaux, qui sont déjà la structure spatiale.
- Un canal supprimé de la topologie fait retomber ses cartes sur la nature
  `complicated` (référence périmée, affichage seulement — ADR 013).
