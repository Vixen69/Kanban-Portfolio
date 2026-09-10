# ADR 029 — Plan de charge : trois natures de lignes, personnes nominatives, capacité lue dans le PdC

Date : 2026-09-10 · Statut : accepté (décision de l'auteur, à contester à la revue)

## Contexte

Le lecteur du plan de charge (ADR 024/028) prenait chaque ligne du fichier
`PdC.2026` pour une affectation projet et chaque ligne à matricule pour une
personne. L'auteur a ouvert le fichier : c'est un export **par ressource**.
Pour chaque ressource, une ligne par affectation projet, plus deux lignes
propres portées par la même colonne « Id Projet » : « Disponible ressource
(en jour) », la capacité annuelle de la personne, et « Planifiée projet (en
jour) », le total de ses affectations calculé par l'outil. Chacune avec un
Prév. et un Réel de l'exercice. La colonne « Ressource » mêle des personnes
nommées, des « affectations génériques », des codes « zz… » à ne pas utiliser
et des rôles génériques « PE22… ». Les noms de projet se répètent d'un code à
l'autre.

Conséquences observées sur l'audit de septembre : projeté par personne
compté deux fois (lignes projet + ligne « Planifiée »), « Disponible » pris
pour un projet, 490 « projets PdC hors périmètre », un projeté de 20 000 j.h
pour 25 700 de capacité, et des domaines où 33 « personnes » apparaissaient
pour une dizaine d'internes réels.

## Décision

1. **Trois natures de lignes**, nommées par « Id Projet » : `capacity`
   (« Disponible ressource »), `planned` (« Planifiée projet »), `project`
   (tout le reste). Les deux lignes propres ne comptent jamais comme charge.
2. **Projets agrégés par code**, jamais par nom ; la jointure aux cartes se
   fait code d'abord, puis nom exact, puis titre ; un nom ambigu ne joint rien.
3. **Personnes = ressources nominatives** : « Ressource » qui contient
   « générique », commence par « zz » ou « PE22 », ou sans matricule, n'est
   jamais une personne. Sa charge reste sur le projet (demande sans personne
   nommée), comptée et dite dans le rapport.
4. **Capacité de la personne** = sa ligne « Disponible ressource » ; à défaut,
   « Disponibilité » de Ress.Profils. **Projeté** = sa ligne « Planifiée
   projet » ; à défaut, la somme de ses lignes projet, l'écart étant signalé.
   Ress.Profils reste la source du domaine, du métier et de l'interne/externe.
5. **Deux chiffres nouveaux dans le cœur** : par personne, le reste
   disponible (capacité − projeté, si positif) et la surcharge (projeté −
   capacité, si positif) ; sommés par groupe et en tête de la vue ☷.

## Conséquences

- `adapters/csv-import/pdc.ts` + `pdc-lines.ts` (classification), `charges.ts`
  (jointure par code, compteurs des lignes non nominatives), `capacity.ts`
  (capacité et projeté depuis les lignes propres, `Person.capacitySource`),
  `core/capacity.ts` et `capacity-view.ts` (`freeJh`, `overJh`), vue ☷ (deux
  chiffres de tête, marges dans les barres), rapport (lignes « plan de
  charge » et « capacité » étendues, écarts signalés).
- Le snapshot de capacité ne contient plus que des personnes nommées, avec
  une capacité lue dans l'outil de planification lui-même.
- Non traité ici, ouvert : rattacher la demande sans personne nommée à son
  domaine (via « Organisation ») et à son profil comme « à pourvoir » ; la
  question de l'auteur « capacité d'un domaine = internes seuls ? » (la
  coupe internes / externes de l'ADR 028 reste disponible).
- Fixtures synthétiques enrichies des deux lignes propres, d'un code « zz »
  et d'un rôle « PE22 » ; tests unitaires sur la classification, la clé par
  code, les écarts signalés.
