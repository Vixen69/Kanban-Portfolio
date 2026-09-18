# ADR 043 — Les projets terminés sont gardés, et placés en Done par leur état

Date : 2026-09-18 · Statut : accepté (décision de l'auteur)

## Contexte

L'état Sciforma « Terminé » fait partie des états retenus dans le
périmètre (`exercise.states`, ADR 030) : les projets terminés de
l'exercice entrent donc dans le tableau, avec leurs coûts et leur charge.
Mais l'état ne servait que de filtre d'entrée. La colonne venait des
seuls jalons (RDR approuvé → Done, sinon RDLI → Actifs, sinon RDO →
Études, sinon la colonne d'entrée) : un projet « Terminé » dont le RDR
n'était pas marqué « Approuvé », ou absent de `ProjetsJalons`, atterrissait
en Actifs, en Études, voire en Demandes — sans que le rapport le dise.

Décision de l'auteur : « les garder, mais en Done… de manière à ce que je
puisse faire un réimport et récupérer les terminés que je n'ai pas ».

## Décisions

1. **`exercise.doneStates`** (config, vocabulaire) : les états du
   processus qui veulent dire « projet terminé ». Le modèle versionné
   porte `["Terminé"]`. Chaque état doit figurer dans `exercise.states`
   quand cette liste existe (un état hors périmètre ne placerait aucune
   carte) ; absent = les jalons seuls positionnent, comme avant.
2. **L'état prime sur les jalons** (`adapters/csv-import/enrich.ts`
   `positionOf`) : un projet dont l'état est un `doneStates` va dans la
   colonne terminale de la topologie (l'ancre terminale, jamais un id en
   dur), qu'il ait ou non une ligne dans `ProjetsJalons`. La carte est
   « positionnée » : un réimport la déplace donc comme toute carte que
   l'export fait avancer.
3. **Le désaccord est dit, jamais tu** : « état « Terminé » sans RDR
   approuvé — carte placée en Done par l'état » est compté dans les
   signalements de l'assemblage, et la ligne de position du rapport
   ajoute « en Done par l'état du projet : N ».
4. **La règle du geste manuel tient** (ADR 026) : une carte qu'une
   personne a déplacée à la main garde sa colonne ; le rapport liste la
   divergence (« l'export dit Done, le tableau dit Actifs »), le PMO
   tranche. Une carte terminée absente du tableau est créée directement
   en Done.
5. L'état lu est porté par l'entrée de périmètre (`ProjetEntry.state`),
   depuis COUT PREV (« Projet.Etat du processus ») comme depuis l'onglet
   Projets (« État du processus »).

## Conséquences

- `core/config-types.ts`, `core/config-exercise.ts` (+ tests),
  `config/board.json`, `adapters/csv-import/{couts,projets,enrich,assembly}.ts`,
  `adapters/csv-import/projets-types.ts` (les types du périmètre sortis de
  `projets.ts`, qui était au plafond des 300 lignes),
  `adapters/csv-import/done-state.test.ts`.
- `config/board.json` change : sur la VM, une configuration appliquée
  depuis ⚙ est écartée au redémarrage (ADR 038) ; la refaire depuis ⚙ si
  besoin.
- Les projets terminés pèsent toujours dans la capacité et les totaux de
  l'exercice : ils ont consommé des jours cette année-là. Seule leur
  colonne change.
