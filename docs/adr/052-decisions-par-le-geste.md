# ADR 052 — Décisions par le geste : la fiche « Décision et Raison », le journal global

Date : 2026-09-30 · Statut : accepté (auteur : « tu peux le coder, ce
truc… c'est parti ») · Amende l'ADR 026 (§ décision sur la carte) et
l'ADR 050 (§5) · Fait suite à `docs/design/decisions-proposition.md`

## Contexte

Les décisions se traçaient à la main, dans la fiche, parmi D1–D6. L'auteur
veut que la décision naisse du geste : déplacer en Pause, ou changer le
canal d'un sujet déjà qualifié, ouvre une fiche de traçabilité calquée sur
la « Fiche Décision et Raison » V0.1 (élément de discussion). « Faire
entrer » ne demande rien de plus. Pas de bouton « Stopper » : on met en
pause, puis on archive. Pause tactique / parking : « on l'oublie pour le
moment… laisse-la quand même ». Et un journal global des déplacements.

## Décisions

1. **Le geste est la décision** (`core/gesture.ts`, pur, testé). Entrer en
   Pause = « Mettre en pause » (D4) ; changer un canal déjà choisi par
   quelqu'un = « Requalifier » (D5) ; les deux à la fois = deux décisions.
   Le premier choix de canal n'en est pas une : le glisser de Qualification
   vers un canal, ou la première correction du canal qu'un import a posé
   d'office (« compliqué ») — cette année comme en 2027, où tout arrivera
   non qualifié. Sortir de Pause = « Reprise », sortir de Demandes =
   « Faire entrer » : des libellés, sans fenêtre.
2. **On décide avant d'écrire.** Au dépôt, la carte ne bouge pas
   (contour pointillé) et la fiche s'ouvre ; « Valider » envoie le
   déplacement ET ses décisions en une requête, écrits ensemble
   (`appendEvents` : une écriture JSONL, une transaction Postgres) ;
   « Annuler » ou Échap n'écrit rien ; un clic à côté ne ferme pas. Le
   serveur refuse un tel déplacement sans sa décision (comme un blocage
   sans motif) ; le formulaire d'édition (canal, colonne) passe par la même
   fiche ; la bande repliée de Pause accepte les dépôts.
3. **La fiche** reprend la V0.1 : 1 instance (Revue Stratégique / Synchro,
   facultative ; « décidée le » pour une décision prise sur papier) ;
   3 la raison — termes « pause » de la grille et « en clair » — et, repliés
   et facultatifs, les options écartées et 4 ce que la décision libère
   (personnes, budget, capacité) ; 5 la pause — type facultatif tactique /
   parking, échéance du réexamen obligatoire (proposée à un mois) sauf en
   parking, ce qui la lèverait ; 6 la requalification — ce qui a changé
   dans la nature du sujet (obligatoire), validée par un architecte.
4. **La section Décision de la fiche** garde toute la trace avec ses blocs
   et, pour une carte en Pause, « Tracer la pause » (décidée hors de
   l'outil) ou « Reconduire la pause » (« prolonger est une décision :
   nouvelle fiche »). Le formulaire manuel D1–D6 disparaît.
5. **Au tableau, seule la pause en cours se voit**, sur les tickets de
   Pause : « D4 », ou « T » / « P » si le type est dit, cerclée de rouge
   passé l'échéance ; « ? » pointillé si la pause n'est pas tracée. Le
   compteur « Pause : réexamen dépassé » ne compte qu'elles. Un changement
   de canal dans la même étape ne remet plus l'âge à zéro.
6. **Journal** (Analytics › Journal, `core/journal.ts`) : mouvements,
   décisions, blocages, archivages — l'import sur demande — du plus récent
   au plus ancien, par jour ; période 7 / 30 jours, l'exercice, ou depuis
   un instantané ; recherche ; un clic ouvre la fiche. Filtré sur
   « Décisions » depuis l'instantané de la séance : le relevé à diffuser.

## Conséquences

- `board.json` ne change pas (ADR 038 : aucune configuration appliquée
  écartée sur la VM). D1, D2, D3, D6 restent au vocabulaire, plus proposés ;
  les décisions déjà tracées restent lisibles. Le 3ᵉ terme de la grille
  (« Affame un fournisseur saturé ») diffère de la fiche papier
  (« contention sur une ressource interne limitée ») : à réconcilier.
- Port `BoardStorage.appendEvents` ; `middle/moves.ts` (déplacement +
  décisions), `middle/decisions.ts` (blocs de la fiche) ;
  `core/gesture.ts`, `decision-record.ts`, `journal.ts`, `decisions.ts`
  (`pauseStatus`), `history.ts`, `state.ts` ; front `useMoveGate.ts`,
  `useBoardMoves.ts`, `decisionDraft.ts`, `DecisionDialog.tsx`,
  `decisionBlocks.tsx`, `JournalView.tsx`, `DetailDecision.tsx`,
  `cardMarks.tsx`, `CollapsedCells.tsx`. L'acteur de l'import vit dans
  core. Le garde-fou d'architecture lit les imports en début
  d'instruction (« l'import » d'un libellé n'est pas un import).
- Écarts du référentiel à corriger côté document : voir la proposition
  (§ « Écarts avec le référentiel V3.1 »).
