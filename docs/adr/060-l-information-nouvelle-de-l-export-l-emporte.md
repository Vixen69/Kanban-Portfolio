# ADR 060 — L'information nouvelle de l'export l'emporte

Date : 2026-09-30 · Statut : proposé (branche import-lisible) · Précise les
ADR 026 (position), 054 (faits gardés) et 059 (adoption)

## Contexte

Jusqu'ici, une correction faite à la main dans la fiche (un événement
`edited` : l'estimé passé de 120 à 150 k€, un autre chef de projet) gagnait
**pour toujours** : le pli rejoue la correction par-dessus la carte de base,
que l'import rafraîchit sans jamais la voir. De même, une carte déplacée à
la main vers une autre colonne n'était plus jamais placée par les jalons
(ADR 026), même quand Sciforma annonçait un jalon franchi depuis. Règle de
l'auteur (30/09) : l'information **nouvelle** de l'export gagne ; tant que
l'export répète ce qu'il disait déjà, le travail fait à la main reste.
Pour les positions : « ça démarre dans Demandes, sauf s'il y a déjà un
jalon… s'il y a le fichier ProjetsJalons, on prend cette info si elle est
nouvelle ; si elle est d'un jalon qu'on n'avait pas avant, on actualise ».

## Décision

**« Nouvelle »** se lit contre ce que l'import précédent a écrit : la carte
de base stockée.

1. **Faits** (ceux de l'ADR 054 : chef de projet, type, code projet, les
   quatre montants k€, les charges j.h, le plan de charge, la date RDR) :
   quand l'export porte une valeur (pas un vide — ADR 054), différente de
   celle de la carte de base, et qu'une correction à la main la masque au
   tableau, le chargement écrit **un** événement `edited` de l'import
   (`import-csv`, motif « export ») qui porte la nouvelle valeur : elle
   gagne. Rien n'est écrit quand l'export répète l'ancienne valeur, ni
   quand aucune correction ne la masque (la carte de base suffit). Le plan
   de charge reste un tout : un nouveau plan remplace aussi les « fait »
   saisis à la main métier par métier. Hors règle : le **titre** (un titre
   retouché par le PMO est un libellé voulu), l'identifiant Sciforma (jamais
   saisi) et le **domaine** (conflit tranché par le PMO, ADR 036). Une
   carte créée à la main et adoptée (ADR 059) n'a pas d'import précédent :
   sa carte de base est celle de la saisie ; une valeur de l'export qui en
   diffère est nouvelle et reprend aussi ses corrections à la main.
2. **Positions** : une carte déplacée à la main vers une autre colonne est
   déplacée par l'import quand ProjetsJalons donne une colonne **nouvelle**
   (différente de celle de l'import précédent) **et plus avancée** dans le
   flux (ordre des colonnes du modèle) que sa colonne actuelle. Un jalon
   répété, ou en retrait de la colonne choisie à la main : la carte reste,
   la divergence est dite (comme avant). Une carte créée à la main adoptée
   au chargement (ADR 059) n'a pas d'import précédent : ses jalons la
   placent dès qu'ils la mettent plus loin que sa colonne.
3. Un chargement **sans position** pour une carte (pas de fichier jalons,
   pas de ligne) garde dans la carte de base la colonne de l'import
   précédent — il n'y écrit plus la colonne d'entrée — et le canal stocké :
   l'export ne place jamais le canal d'une carte existante (ADR 058).

Le rapport d'import le dit : « correction manuelle remplacée par la
nouvelle valeur de l'export » (nombre de cartes, fait par fait, les cartes
nommées) et « placement à la main dépassé par un nouveau jalon » (de → à) ;
la commande `sync/import.ts` aussi ; le journal du serveur n'en donne que
les comptes.

## Conséquences

- Recharger les mêmes fichiers n'écrit toujours rien (ADR 058).
- Une carte de base écrite avant cette décision par un chargement sans
  jalons porte encore la colonne d'entrée : le premier jalon reçu y compte
  comme nouveau (c'est bien la première position que l'export donne).
- ~~La colonne Pause est dans l'ordre du modèle (entre Prêts et Actifs) : une
  carte mise en Pause à la main en sort si un nouveau jalon la place en
  Actifs ou au-delà.~~ **Amendé le 30/09** : voir ci-dessous.
- L'Historique de la fiche ne narre pas les `edited` (hors domaine : voir
  l'amendement du 30/09 de l'ADR 061) ; la comparaison avec
  l'instantané « avant chargement » (ADR 053) montre la valeur reprise.
- `adapters/csv-import/newer-facts.ts`, `load-position.ts` (+ tests
  `newer-info.test.ts`), `to-cards.ts`, `import-changes.ts`,
  `core/import-changes.ts` (`replaced`, `advanced`), `core/import-types.ts`,
  `middle/import.ts` (+ `import.newer.test.ts`), `sync/import*.ts`.

## Amendement (2026-09-30) — la Pause n'est jamais levée par un jalon

Choix prudent, en attendant l'avis de l'auteur : une carte en **Pause** y a
été mise par un humain, et la Pause est une décision d'arbitrage (D4). Aucun
jalon, nouveau ou non, plus avancé ou non, ne l'en sort : la carte reste en
Pause et le rapport le dit comme une divergence, « en pause — nouveau jalon
non appliqué » (liste dédiée dans le rapport lisible, dans la commande et
dans le résultat du chargement ; comptée aussi dans les divergences). La
colonne est reconnue par son identifiant `pause` du modèle versionné
(`config/board.json`). Sortir de Pause reste un geste à la main.
La liste « en pause — nouveau jalon non appliqué » ne cite que les cartes
qu'un jalon **nouveau** et **plus avancé que la Pause** aurait déplacées
(revue, 2026-09-30) : le même jalon qu'au chargement précédent, ou un jalon
en arrière, reste une simple divergence.
Fichiers : `adapters/csv-import/load-position.ts` (`PAUSE_COLUMN_ID` de `core/gesture.ts`),
`to-cards.ts`, `import-changes.ts`, `core/import-changes.ts` (`paused`),
`core/import-types.ts`, `middle/import.ts`, `sync/import-text.ts`,
`front/importReport.ts`, `front/components/ImportLists.tsx`.

## Amendement 2026-09-30 — « terminé, c'est terminé »

Décision de l'auteur : « si le statut Sciforma c'est terminé, c'est que
c'est terminé ». Une carte en **Pause** dont l'état du processus est un
état terminé (`exercise.doneStates`, ADR 043) va dans la colonne terminale,
selon la règle de l'information nouvelle : quand cet **état** est
**nouveau** depuis l'import précédent — le dernier chargement qui a placé la
carte ne l'avait pas mise en Terminé par son état (un RDR approuvé avant la
clôture l'y avait peut-être déjà mise par jalon : l'état reste nouveau), ou
il n'y a pas d'import précédent (carte adoptée, ADR 059) —, le chargement la
déplace (un `moved` de `import-csv`, compté dans les déplacées) et le dit :
« sorti de Pause : état Sciforma terminé » (liste dédiée dans le rapport
lisible, dans la commande et dans le résultat du chargement ; le journal du
serveur n'en donne que le compte). Le même état répété, après qu'une
personne a remis la carte en Pause, la laisse : simple divergence (la main
gagne sur les répétitions). Un **jalon seul** (RDR approuvé sans état
terminé) ne sort toujours pas une carte de Pause (« en pause — nouveau
jalon non appliqué », inchangé). Pour les distinguer, la carte assemblée
porte `doneByState` quand c'est l'état qui l'a mise en Terminé (même si un
RDR approuvé est d'accord), et la carte de base stockée garde ce fait
(`doneByState` : vrai = placée par l'état, faux = placée par ses jalons ;
un chargement sans position conserve la valeur précédente). C'est ce fait,
et non la colonne stockée, qui dit si l'état est nouveau. Une carte de base
écrite avant ce champ (aucune valeur) se lit par sa colonne, comme avant :
déjà dans la colonne terminale = pas nouveau — le premier chargement après
la mise à jour ne sort donc pas de cartes de Pause en masse, et le champ
fait foi dès lors. Pas de changement de schéma (cartes en jsonb).
Fichiers : `adapters/csv-import/enrich.ts`, `card-row.ts`,
`load-position.ts`, `to-cards.ts`, `import-changes.ts`,
`core/import-changes.ts` (`unpaused`), `core/import-types.ts`,
`core/types.ts` (`Card.doneByState`),
`middle/import.ts`, `sync/import-text.ts`, `front/importReport.ts`,
`front/components/ImportLists.tsx` ; tests `newer-info.test.ts`,
`done-state.test.ts`.
