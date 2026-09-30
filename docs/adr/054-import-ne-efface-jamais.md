# ADR 054 — Un import n'efface jamais une information absente des fichiers

Date : 2026-09-30 · Statut : accepté · Précise l'ADR 026 (« rien n'est écrasé »)

## Contexte

Le 30 septembre, l'auteur recharge un jeu partiel : Coût, Projets, SP 2026,
Ressources PdC — sans ProjetsCdP. Tous les chefs de projet disparaissent du
tableau. Cause : à chaque chargement, l'import reconstruit la carte de base
d'un projet déjà présent à partir des seuls fichiers reçus ; un fichier
absent (ou une cellule vide) donnait un champ vide, qui remplaçait la valeur
stockée. Même mécanisme pour les budgets sans SP, le plan de charge sans
PdC, la date RDR et les charges estimée/consommée sans l'onglet Projets
(l'export COUT PREV ne les porte pas). Règle de l'auteur : « s'il y avait
une info et que le nouvel import, il n'y a pas l'info, on garde ».

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
  ligne utilisable pour la carte, le nouveau plan remplace l'ancien en
  entier ; s'ils n'en portent aucune (ou seulement des lignes dont le métier
  est inconnu du modèle, comptées au rapport), l'ancien reste en entier ;
- la **capacité** (instantané de l'année, remplacé à chaque plan de charge
  chargé) garde de même ses parties laissées vides : la lecture « Charge »
  COUT PREV sans fichier Coût, le domaine, le profil ou la capacité d'une
  personne sans PARAM ni Ress.Profils (`keep-capacity.ts`) ;
- la carte nouvelle n'a rien à garder ; la position et le domaine suivent
  toujours leurs propres règles (ADR 026, ADR 036).

L'audit annonce, avant le chargement, ce qui sera gardé sur les cartes
(« chef de projet : 120 cartes ») ; le chargement dit ce qu'il a gardé. La
commande `sync/import.ts` le dit au chargement ; le journal du serveur n'en
donne que les comptes.

Choix assumé : une information réellement retirée de Sciforma (un chef de
projet supprimé sans remplaçant, un plan de charge vidé) reste sur la
carte ; elle se corrige à la main, dans la fiche. De même, un type devenu
hors liste ou un responsable reconnu comme responsable de domaine laissent
le champ vide dans les fichiers : l'ancienne valeur reste.

## Conséquences

- Plus de « mode d'import » : un jeu complet et un jeu partiel se chargent
  de la même manière ; le partiel met à jour ce qu'il porte, rien d'autre.
- Les valeurs déjà effacées par le chargement du 30/09 ne reviennent pas
  seules : restaurer l'instantané « avant chargement 2026 » puis recharger,
  ou recharger en ajoutant l'ancien fichier ProjetsCdP.
- Décidé (auteur, 2026-09-30 : « on garde ») : un projet absent d'un plan
  de charge PRÉSENT garde son ancien plan sur la carte ; la vue Capacité,
  elle, ne le voit plus (ses affectations suivent le fichier).
- L'ADR 060 précise la règle quand une valeur présente est **nouvelle** et
  qu'une correction à la main la masquait : la nouvelle valeur l'emporte.
- `keep-facts.ts`, `keep-capacity.ts` (+ tests), `to-cards.ts`,
  `core/import-types.ts` (`factsKept`), `middle/import.ts` (+ tests),
  `sync/import.ts`, `front/components/ImportView.tsx`.
