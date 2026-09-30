# ADR 055 — Un rapport d'import lisible : ce qui change, et pourquoi

Date : 2026-09-30 · Statut : accepté · Étend l'ADR 053 (« Comparer avec
maintenant ») et l'ADR 054 (« un import n'efface jamais »)

## Contexte

L'auteur, le 30 septembre : « quand je fais des mises à jour d'import… le
rapport devrait être structuré d'une manière plus lisible pour moi… dans ce
qui a changé, les valeurs qui sont actualisées, je dois pouvoir les voir
rapidement à un endroit et savoir vraiment ce qu'il a pris » ; « une manière
de voir pendant un temps qu'est-ce qui a changé depuis l'import » ; « il ne
faudrait pas qu'il y ait deux modes d'import ».

L'enquête du même jour sur l'import le confirme : l'audit et le chargement
ne donnaient que des **comptes** (« 2 absentes », « état hors liste 5 »),
jamais **quel** projet entre ou sort, ni **par quelle règle**. Le périmètre
COUT PREV décidait projet par projet puis jetait la raison ; un projet dont
le portefeuille ne résout aucun domaine tombait sans le dire dans le premier
domaine du modèle (A&D). La comparaison de l'ADR 053 disait ce qui avait
bougé sur le tableau, pas les chiffres ni le pourquoi.

## Décision

1. **Un seul moteur de comparaison** (`core/snapshot-diff.ts`, types dans
   `core/change-types.ts`, valeurs dans `core/figure-changes.ts`). En plus
   des arrivées, absences, retours, déplacements, domaine, type et titre, il
   compare les **valeurs actualisées** : chef de projet, enveloppe RDLI,
   estimé, engagé, réalisé (k€), meilleur estimé et consommé (j.h), date
   RDR, et le **plan de charge** — prévu, fait et reste à faire de la carte
   avec l'arithmétique de l'ADR 048 (par métier, max(0, prévu − fait), sans
   repli sur la charge de la carte), et le détail des métiers qui ont bougé.
   Les chiffres voyagent en **nombres** (avant, après, écart), jamais en
   texte : la vue les formate et montre la hausse ou la baisse. « Comparer
   avec maintenant » et le rapport d'import lisent ce même moteur.
2. **Chaque projet a son verdict** : le périmètre COUT PREV note pour chaque
   projet lu s'il est retenu (sur quel état, quel type) ou écarté, et pour
   quelle première règle (hors exercice, état « X » hors des états retenus,
   type « X » hors des types retenus, ligne d'arbitrage, aucune cellule ME
   non nulle). L'onglet Projets, quand il fait le périmètre, fait de même
   (retenu, ou Id en double).
3. **Un objet `changes`** rendu à l'identique par l'audit et par le
   chargement (`ImportAuditResult.changes`, `core/import-changes.ts`) :
   - les **fichiers** : pour chaque source attendue, le fichier pris ou son
     absence, son statut (pris / absent / écarté / douteux) et ce que le
     chargement fait sans elle (« chefs de projet gardés », « positions
     gardées », « budgets gardés », « plan de charge et capacité gardés ») ;
   - le **périmètre** : où il est lu, combien de projets retenus, la liste
     des écartés avec leur motif ;
   - les **comptes** : relues, créées, absentes, de retour, déplacées,
     divergences, cartes aux valeurs changées, cartes aux valeurs gardées ;
   - les projets qui **entrent** (avec la raison, et l'avertissement
     « domaine non résolu → A&D par défaut, à corriger » quand aucun domaine
     n'a été trouvé), qui **sortent** (le motif d'exclusion, ou « plus
     présent dans le fichier Coût « … » »), qui **reviennent** ;
   - les **changements carte par carte** entre le tableau maintenant et le
     tableau après le chargement (une lecture à blanc du journal : rien
     n'est écrit) ;
   - les **faits gardés** de l'ADR 054, fait par fait, avec les cartes
     nommées.
   À l'audit, c'est ce que le chargement **changera** (aucune décision de
   domaine prise : le domaine du tableau reste) ; au chargement, ce qu'il
   **a changé**. Un seul mode d'import : prévisualisé, puis appliqué.
4. La commande `sync/import.ts` imprime la même chose en texte court :
   fichiers et périmètre à l'audit, changements au chargement ; `--comparer`
   les prévisualise à l'audit en lisant le tableau, sans rien écrire.

Le rapport Markdown existant ne change pas : il devient le « rapport
technique », replié sous le rapport lisible.

## Vue

L'écran d'import (⚙ › Importer) lit cet objet de haut en bas, dans une
maquette validée par l'auteur :

1. **Les chiffres clés** : projets mis à jour · nouveaux · absents de
   l'import (∅) · valeurs changées · gardées (absentes des fichiers), sous
   le titre « Ce que le chargement va changer » à l'audit, « Ce que le
   chargement a changé » après. Un audit dont le périmètre ne s'assemble
   pas ne montre pas de chiffres : il dit que rien ne serait écrit.
2. **Les fichiers** en pastilles : « ✓ Coût », « ✓ Projets »… pour les
   fichiers pris ; un fichier manquant en ton d'alerte avec ce que le
   chargement fait sans lui (« ProjetsCdP absent → chefs de projet
   gardés ») ; un fichier facultatif manquant en gris. Replié dessous : le
   périmètre et ses projets écartés avec leur motif, le détail des fichiers.
3. **Valeurs actualisées** : une section repliable par fait avec son
   nombre (plan de charge, estimé, réalisé, engagé, enveloppe RDLI k€,
   meilleur estimé, consommé j.h, chef de projet, date RDR, type, titre,
   domaine, déplacés). Chaque ligne : code · titre · ancien → nouveau,
   hausse ↑ en ton d'alerte, baisse ↓ en ton vert, sans décor. La ligne du
   plan de charge dit « prévu a → b j.h · RAF a → b j.h » et se déplie sur
   les métiers qui ont bougé. Seule la première section s'ouvre, et
   seulement sous 30 lignes.
4. **Nouveaux projets** (raison, et l'avertissement « domaine par défaut »),
   **Absents de cet import** (raison), **De retour** ; puis **Gardées,
   absentes des fichiers**, fait par fait avec les projets. Une liste de 10
   lignes au plus s'ouvre seule.
5. Les conflits de domaine et les commandes de chargement restent tels
   quels ; le **rapport technique complet** (le Markdown) est replié en bas.

Le bouton « Voir ce qui a changé depuis le dernier import » retrouve
l'instantané « avant chargement <année> » le plus récent de l'exercice
choisi et le compare au tableau maintenant. « Comparer avec maintenant »
(Instantanés) montre les mêmes sections, avec en plus les arrivées,
absences, disparitions, retours et archivages : **un seul composant** pour
les changements groupés (`front/components/ChangeSections.tsx`), les mots
et les regroupements dans des fonctions pures testées
(`front/changeGroups.ts`, `front/importReport.ts`). Rien ne bouge (ADR 051).

## Conséquences

- Le PMO voit, avant de charger, quel projet entre ou sort et pourquoi, et
  quels chiffres montent ou baissent ; il peut distinguer « les fichiers ont
  changé » de « l'outil a dérivé ».
- Le repli sur le premier domaine du modèle reste (comportement de l'ADR
  036), mais il est **dit** pour chaque carte créée ainsi.
- Le verdict n'est pas encore écrit dans le journal (événements `unlisted`
  et `imported` sans motif) : la raison se lit dans le rapport du
  chargement, pas dans l'Historique de la fiche.
- Fichiers : `core/change-types.ts`, `core/figure-changes.ts`,
  `core/snapshot-diff.ts`, `core/import-changes.ts`, `core/import-types.ts`,
  `adapters/csv-import/` (`couts.ts`, `couts-verdicts.ts`, `projets.ts`,
  `projets-types.ts`, `orchestrate.ts`, `import-files.ts`,
  `import-changes.ts`, `keep-facts.ts`, `card-row.ts`, `to-cards.ts`),
  `middle/import.ts`, `middle/snapshots.ts`, `sync/import.ts`,
  `sync/import-text.ts`, et leurs tests ; pour la vue, `front/changeGroups.ts`,
  `front/importReport.ts`, `front/components/` (`ChangeSections.tsx`,
  `ChangeRows.tsx`, `FilesStrip.tsx`, `ImportChanges.tsx`,
  `ImportLists.tsx`, `ImportOutcome.tsx`, `ImportSince.tsx`,
  `ImportView.tsx`, `SnapshotDiffView.tsx`), `front/styles/admin.css`, et
  leurs tests.
- Dans « Comparer avec maintenant », seule la première section s'ouvre
  désormais (avant : toutes celles de 30 lignes au plus) : une seule règle
  pour les deux écrans.
