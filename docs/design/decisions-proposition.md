# Proposition — les décisions par le geste (sans code)

Date : 2026-09-29 · Statut : **adoptée le 2026-09-30, construite (ADR 052)**, avec
ces écarts voulus par l'auteur : pas de « Stopper » (pause, puis archiver) ;
le type de pause (tactique / parking) facultatif ; board.json inchangé.

Demande de l'auteur (2026-09-29) : quatre décisions seulement — Faire
entrer, Requalifier, Mettre en pause, Stopper ; « Continuer » et
« Réduire » disparaissent ; pause tactique ou parking ; une fenêtre courte
sur le modèle de la fiche papier ; « il faut qu'on y réfléchisse avant de
le faire ».

## En bref

Chaque décision naît d'un **geste sur le tableau**, pas d'un formulaire.
Faire entrer n'écrit rien de plus : le déplacement Demandes → Qualification
est déjà dans le journal, il suffit de l'étiqueter. Requalifier, mettre en
pause et stopper ouvrent une **fenêtre courte**, calquée sur la « Fiche
Décision et Raison » V0.1. Tant qu'elle n'est pas validée, **la carte ne
bouge pas** : le serveur refuse un tel déplacement sans sa décision, comme
il refuse déjà un blocage sans motif. Rien n'est jamais effacé. Coût : cinq
à six jours. **Pour la RSP du 1er octobre : aucun changement de code.**

## Les quatre décisions

| Décision | Déclencheur | Ce qui s'écrit | Fenêtre |
|---|---|---|---|
| **Faire entrer** (D1) | La carte sort de Demandes pour la première fois, à la main | Rien de plus : le `moved` existant, étiqueté « Faire entrer » avec sa date | Aucune |
| **Requalifier** (D5) | Changement de canal d'une carte dont le canal a **déjà été choisi** (glisser, ou sélecteur Canal de la fiche) | Un `decided` D5 écrit **avec** le `moved` : canal de départ, canal d'arrivée, motif, « validée par un architecte » | Oui |
| **Mettre en pause** (D4) | Dépôt dans Pause depuis une autre colonne (ou sélecteur Colonne) | Un `decided` D4 écrit avec le `moved` : **tactique ou parking**, termes de la grille, motif, date de réexamen (tactique seulement) | Oui |
| **Stopper** (D6) | Bouton « Stopper… » dans le pied de la fiche, à côté d'« Archiver » — **pas de glisser** (geste rare et grave) | Un `decided` D6 puis un `archived` motif « stop », dans la même écriture | Oui |
| Continuer (D2), Réduire (D3) | — retirées | Rien. Les anciens évènements restent dans le journal, lus « décision retirée (D2) » | — |

Précisions :

- **Le premier choix de canal n'est pas une décision** : le glisser de
  Qualification vers un canal d'Études, c'est la qualification (« Qualifiée :
  Petits Projets » dans l'historique), sans fenêtre. Idem pour la première
  correction d'une carte importée, rangée d'office en « compliqué ».
- **Faire entrer** : une carte importée directement au-delà de Demandes n'a
  pas de ligne « Faire entrer » (« importée en Actifs »). Le référentiel
  réserve l'entrée à la Revue trimestrielle ; le tableau trace, il ne
  contrôle pas.
- **Pause + changement de canal** dans le même dépôt : une seule fenêtre,
  les deux décisions tracées.
- **Sortir de Pause** est une reprise : pas de fenêtre, le déplacement
  suffit.
- **Stopper** : la carte quitte le tableau, son RAF cesse de compter ; les
  Archives deviennent le « cimetière » (« Stoppé le … » et le motif),
  « Désarchiver » reste possible et tracé. Pas de colonne « Stoppé » (ce
  serait une modification de board.json et tout ce qui est à droite de
  Terminé compte comme livré).

## Pause tactique, pause parking

- Le type est un **champ de la décision** (`pauseKind`), pas deux colonnes
  ni deux décisions, et pas une clé de configuration (une nouvelle clé
  écarterait la configuration appliquée sur la VM, ADR 038).
- **Tactique** = réexamen à la synchro suivante : date **obligatoire**,
  préremplie à un mois, modifiable. **Parking** = « plus tard » : pas de
  date ; l'âge dans la colonne dit depuis quand.
- Aucun calendrier des synchros n'existe dans l'outil. Si les dates de
  l'année sont connues, elles se rangent à part (comme `exercise.json`),
  hors de board.json.
- **À l'écran**, sur les tickets de Pause seulement : « T » (violet plein)
  ou « P » (contour violet) ; le « T » cerclé de rouge quand la synchro
  prévue est passée ; un « ? » pointillé pour une carte en Pause sans pause
  tracée (les placements RDOM faits sur papier). Info-bulle : « Pause
  tactique · réexamen le 03/11 », « Parking depuis le 29/09 ». Même marque
  dans la liste qui s'ouvre sur la bande repliée.
- Dans la fiche d'une carte en Pause : « Reconduire (tactique) », « Passer
  au parking », et « Tracer la pause » (avec « décidée le ») pour une pause
  décidée sur papier. Chaque action écrit une **nouvelle** décision, jamais
  une correction.
- Écartés : trier les tactiques au-dessus des parkings (contredit l'ordre
  manuel) ; deux colonnes (changement de topologie).

## Et si on annule ?

**On décide avant d'écrire.** Au dépôt, rien n'est envoyé : la carte reste
dans sa case avec un contour pointillé, la case d'arrivée reste allumée, la
fenêtre s'ouvre. **Valider** envoie une seule demande (déplacement +
décision), écrite d'un bloc ; le cadre de 4 secondes s'allume à ce
moment-là. **Annuler** : rien n'est écrit, la carte n'a pas bougé. Un clic
à côté ne ferme pas la fenêtre (trop facile en séance) ; Échap annule, sauf
en plein écran où le navigateur le garde pour sortir du plein écran.

Écartés : écrire le déplacement d'abord puis la décision (une annulation
laisserait une pause non tracée, la défaire salirait le journal et
remettrait l'horloge à zéro) ; un bouton « Déplacer sans tracer » (une
décision non tracée est réputée non prise).

## Modèle de données

1. `decided` garde decisionId, grounds, reason, reviewDate et gagne des
   champs facultatifs (les anciens évènements restent lisibles) :
   `pauseKind`, `decidedOn` (le jour de la décision, pour reporter une
   décision prise sur papier), `instance` (Revue ou Synchro — utile tant
   que l'acteur reste « anonymous »), `fromLaneId`/`toLaneId`,
   `architectValidated`, et les textes facultatifs de la fiche papier.
   `moved` ne change pas.
2. **Écriture groupée** : `appendEvents` sur le port `BoardStorage`
   (transaction Postgres, une écriture JSONL) pour déplacement + décision
   et D6 + archivage. Une restauration (ADR 042) ne peut pas séparer la
   paire.
3. Un **module pur de core**, testé, classe chaque déplacement : rien,
   entrée, première qualification, requalification, pause, sortie de pause.
   Le front s'en sert pour ouvrir la fenêtre, le middle pour refuser un
   déplacement sans décision.
4. **board.json change une seule fois** : D2 et D3 retirés (et les
   libellés courts en mots si choisi). Aucune nouvelle clé.
5. **Anciens D2/D3** : non migrés (journal en ajout seul), affichés
   « décision retirée ». À compter sur la VM avant la livraison —
   probablement zéro.
6. **ADR 038** : toute modification de board.json écarte au redémarrage la
   configuration appliquée par ⚙ sur la VM. Donc : un seul changement de
   board.json, **avec la recoloration écrite dedans**, et pas de
   recoloration par ⚙ d'ici là.
7. Effets de bord : l'historique nomme les canaux (« Requalifié : Projets →
   Petits Projets ») ; un changement de canal dans la même colonne ne remet
   plus l'âge à zéro ; fixtures revues (quelques pauses de chaque sorte).

## Journal global (réponse à « un historique de tous les déplacements »)

Oui, et c'est peu coûteux : tout est **déjà** dans le journal, et le
navigateur le tient déjà en entier (l'Historique de la fiche n'en est qu'un
filtre par carte). Ni stockage, ni API, ni changement de modèle.

- **Où** : un troisième onglet d'Analytics (Capacité · Flux · **Journal**),
  borné à l'exercice affiché.
- **Quoi** : un tableau dense, le plus récent en haut, groupé par jour —
  Quand · Sujet (un clic ouvre la fiche) · Geste (Faire entrer, Qualifiée,
  Déplacée, Requalifiée, Mise en pause, Reprise, Stoppée, Bloquée…) · De →
  Vers · Motif · Par. En tête : « 14 mouvements · 5 décisions · 2 blocages
  depuis RSP 01/10 ».
- **Filtres** : période (depuis un **instantané** — c'est le « depuis la
  dernière synchro » —, 7 j, 30 j, l'exercice), type de geste (l'import
  éteint par défaut), recherche sans accents. Réordonnancements exclus.
- Filtré sur « décisions depuis l'instantané de la séance », il devient le
  **relevé de décisions** à diffuser après chaque revue (règle 7.8).
- Limite : « Par » dit « anonymous » jusqu'à l'authentification (RP3).
- Il pourra relire **après coup** tout ce qui se sera passé le 1er octobre.

## Écarts avec le référentiel V3.1 (à corriger côté document)

- Règle 7.4, glossaire, annexe A2 : six décisions « et aucune autre » →
  quatre. Le « continuer, réorienter, suspendre » du Go/No-Go de tranche du
  canal complexe reste distinct (ce n'est pas une décision de portefeuille).
- Pause (§3.9, D4, bloc 5 de la fiche papier) : le référentiel exige
  toujours une date de réexamen et ne connaît ni tactique ni parking.
- Synchro (§7.2, §7.3) : elle ne prononce qu'une « pause conservatoire »
  que la Revue confirme — dire qui reconduit, passe au parking ou lève une
  pause tactique à la synchro suivante.
- Requalification (§1.8, §3.4, §7.7) : écrire que le premier canal
  prononcé au RDO n'en est pas une.
- Demande retirée par le métier (§3.2) et refus au RDO (§3.4) : les
  rattacher à Stopper.
- Fiche papier V0.1 : troisième terme de la grille et noms de canaux
  différents du référentiel et du tableau ; la famille PROTÉGER ne motive
  plus aucune décision sans « Continuer ».

## Questions à l'auteur (défaut recommandé entre parenthèses)

1. Le « template qu'on a fait », c'est la Fiche Décision et Raison V0.1 ?
   (Oui : la fenêtre reprend ses blocs 2 à 6, l'obligatoire en haut, le
   reste replié.)
2. Corriger pour la première fois le canal d'une carte importée, est-ce une
   requalification ? (Non, c'est sa qualification.)
3. Annuler la fenêtre laisse la carte où elle était, rien d'écrit, pas de
   « Déplacer sans tracer » ? (Oui.)
4. Stopper = tracer puis archiver, bouton dans la fiche, pas de glisser ?
   (Oui.)
5. Dates des pauses : tactique préremplie à un mois ? Les dates des
   synchros de l'année sont-elles fixées ? Le parking est-il relu à chaque
   Revue ? (Un mois, modifiable ; parking sans date.)
6. Codes D1/D4/D5/D6 à l'écran, ou des mots ? (Des mots ; T/P sur les
   tickets de Pause ; les ids inchangés dans le journal.)
7. Une requalification dans la même colonne remet-elle l'âge à zéro ?
   (Non : l'âge compte le temps dans l'étape, le canal n'est pas une étape.)
8. Sur la VM : catégories déjà recolorées par ⚙ ? décisions D2/D3 déjà
   tracées ? (Pas de recoloration par ⚙ d'ici la livraison ; les couleurs
   iront dans board.json avec le retrait de D2/D3.)

## Découpage proposé

- **Avant la RSP du 1er octobre : rien.** Décisions sur la fiche papier (ou
  la section Décision actuelle, qui fonctionne pour D4, D5, D6). Prendre un
  instantané « RSP 01/10 — ouverture » avant la séance et « RSP 01/10 —
  clôture » après. **Pour glisser une carte en Pause, déplier d'abord la
  colonne** : la bande repliée ne reçoit pas de dépôt aujourd'hui.
- Étape 1 (0,5 j) : réponses aux questions, ADR 052, note des écarts du
  référentiel. Pas de code avant.
- Étape 2 (1 j, lecture seule, sans risque) : l'onglet Journal ; un
  historique de fiche qui nomme les canaux.
- Étape 3 (1 j, core + tests) : le classement des gestes, le type de pause
  et la date de décision, l'horloge gardée lors d'un changement de canal.
- Étape 4 (1 j, middle + tests) : la demande groupée, `appendEvents`, le
  refus d'un déplacement sans sa décision, Stopper.
- Étape 5 (1,5 à 2 j, front) : la fenêtre, le dépôt en attente, la bande
  Pause repliée qui accepte les dépôts, les marques T/P/?, les actions de
  la fiche, « Stoppé le » dans les Archives.
- Étape 6 (0,5 j) : board.json (D2/D3 retirés + recoloration), fixtures,
  test d'un seul écran, documentation, **une seule** livraison sur la VM —
  avant la prochaine synchro, première échéance d'une pause tactique
  décidée le 1er octobre.
