# ADR 054 — Un import n'efface jamais une information absente des fichiers

Date : 2026-09-30 · Statut : accepté · Précise l'ADR 026 (« rien n'est écrasé »)

## Contexte

Le 30 septembre, l'auteur recharge un jeu partiel : Coût, Projets, SP 2026,
Ressources PdC — sans ProjetsCdP. Tous les chefs de projet disparaissent du
tableau. Cause : à chaque chargement, l'import reconstruit la carte de base
d'un projet déjà présent à partir des seuls fichiers reçus ; un fichier
absent (ou une cellule vide) donnait un champ vide, qui remplaçait la valeur
stockée. Même mécanisme pour les budgets sans SP, le plan de charge sans
PdC, la date RDR sans jalons. Règle de l'auteur : « s'il y avait une info et
que le nouvel import, il n'y a pas l'info, on garde ».

## Décision

À un réimport, l'export ne gagne que sur les faits qu'il **porte**
(`adapters/csv-import/keep-facts.ts`) :

- un champ laissé vide par les fichiers (valeur absente, texte vide, liste
  vide) garde la valeur de la carte stockée : titre, chef de projet, type,
  code projet, identifiant Sciforma, enveloppe RDLI, estimé, engagé,
  réalisé, charges estimée et consommée, plan de charge, date RDR ;
- une valeur présente remplace l'ancienne — **zéro compris** (zéro est un
  chiffre, pas une absence) ;
- le **plan de charge est un tout** : si les fichiers portent au moins une
  ligne pour la carte, le nouveau plan remplace l'ancien en entier ; s'ils
  n'en portent aucune, l'ancien reste en entier ;
- la carte nouvelle n'a rien à garder ; la position et le domaine suivent
  toujours leurs propres règles (ADR 026, ADR 036).

L'audit annonce, avant le chargement, ce qui sera gardé (« chef de projet :
120 cartes ») ; le chargement dit ce qu'il a gardé. Même phrase dans la
commande `sync/import.ts`, comptes seuls dans le journal du serveur.

Choix assumé : une information réellement retirée de Sciforma (un chef de
projet supprimé sans remplaçant) reste sur la carte ; elle se corrige à la
main, dans la fiche.

## Conséquences

- Plus de « mode d'import » : un jeu complet et un jeu partiel se chargent
  de la même manière ; le partiel met à jour ce qu'il porte, rien d'autre.
- Les valeurs déjà effacées par le chargement du 30/09 ne reviennent pas
  seules : restaurer l'instantané « avant chargement 2026 » puis recharger,
  ou recharger en ajoutant l'ancien fichier ProjetsCdP.
- `keep-facts.ts` (+ tests), `to-cards.ts`, `core/import-types.ts`
  (`factsKept`), `middle/import.ts` (+ test), `sync/import.ts`,
  `front/components/ImportView.tsx`.
