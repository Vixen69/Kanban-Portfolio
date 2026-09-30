# ADR 050 — Finitions de séance : plein écran, fiches enchaînées, recherche sans accents, budget de mouvement

Date : 2026-09-29 · Statut : accepté (décisions de l'auteur du jour) ·
Amende le §5 de CLAUDE.md

## Contexte

Revue des idées de finition (`docs/design/idees-finition.md`, branche
`proposition-design`). L'auteur retient trois gestes utiles en séance
d'arbitrage, en écarte plusieurs, et tranche la question des animations
déjà présentes sans décision écrite.

## Décisions

1. **Plein écran** : touche F ou bouton de l'en-tête, avant l'engrenage.
   L'API Fullscreen du navigateur : barre d'adresse et onglets disparaissent,
   le tableau garde sa hauteur ; le curseur et toutes les commandes restent
   (pas de curseur masqué, pas de contrôles cachés — l'auteur continue de
   déplacer les cartes). Échap (celui du navigateur) ou F en sort. Règle du
   navigateur : en plein écran, le premier Échap sert à en sortir — il ne
   ferme donc pas la fiche ; on la ferme par ✕ ou d'un clic à côté. (Le
   verrouillage clavier qui l'éviterait n'existe qu'en HTTPS, pas sur la VM
   en HTTP.) Ctrl+F, Cmd+F et les autres raccourcis du navigateur restent
   les siens.
2. **Fiches enchaînées** : fiche ouverte, ← et → passent à la carte
   précédente ou suivante de la MÊME case, dans l'ordre affiché (ordre
   manuel ou tri, filtres et loupe compris) ; une colonne sans canal est une
   seule case. En tête de fiche, « ‹ 3 / 12 › ». Jamais pendant la saisie
   d'un champ, ni quand un formulaire de la fiche est ouvert (blocage,
   décision, éditeurs) ou qu'un commentaire est en cours, ni avec une touche
   de modification ; rien en mode édition. Une fiche archivée hors du
   tableau n'a pas de voisines ; sur un exercice clos, où les cartes
   archivées restent au tableau (ADR 038), elle garde celles de sa case.

3. **Recherche sans accents** : majuscules, accents, apostrophes
   typographiques, œ/æ et espaces multiples ne comptent plus
   (`core/text-search.ts`) — « securite » trouve « Sécurité ». Même règle
   dans les Archives. Entrée dans la recherche ouvre la fiche quand un seul
   sujet reste affiché.
4. **Budget de mouvement** : les transitions existantes restent, sous
   budget strict — 200 ms au plus, seulement en réponse à un geste (focus
   et repli des colonnes, interrupteurs, édition en place), coupées quand le
   poste demande moins de mouvement (`prefers-reduced-motion`). Aucun
   mouvement ambiant, hormis les deux exceptions déjà admises (pulsation du
   blocage, rebond de la flèche de défilement). **Remplacé le soir même par
   l'ADR 051 : plus aucune animation ni transition.**

5. **Pas de déplacement de carte au clavier** : l'alternative clavier
   promise au §5 est abandonnée (« ce n'était pas une bonne idée »).
   Écartés aussi : le rideau, la décision éclair (les décisions se prennent
   sur papier pour l'instant), l'aide-mémoire des raccourcis (il n'y en a
   que cinq : `/`, N, S, F, Échap).
6. **Dernier déplacement signalé** (« les 4 secondes, c'est convaincant ») :
   après un dépôt, la carte déplacée porte un cadre encre de 2 px pendant
   4 secondes, sans fondu — il s'arrête, simplement ; un nouveau dépôt
   remplace le précédent. Une zone invisible à l'écran annonce la même
   chose aux lecteurs d'écran (« Titre : Demandes → Études/Cadrage ·
   Projets », « réordonné dans … » au sein d'une case). Un signal de vue :
   rien n'est écrit de plus, le déplacement reste l'événement du journal.

## Conséquences

- `core/text-search.ts` (+ tests), `core/filters.ts`, `front/cellNav.ts`
  (+ tests), `front/useFullscreen.ts`, `front/components/FullscreenButton.tsx`,
  `CardDetail.tsx`, `Chrome.tsx`, `Sidebar.tsx`, `ArchiveView.tsx`,
  `App.tsx`, `useInteractions.ts`, `useMoveFlash.ts`, `MoveFlash.tsx`,
  `cards.tsx` (`data-card-id`), `base.css`, `board.css`, `modal.css`.
- Aucun changement de modèle, d'API ni de journal.
- Écartée ensuite : la palette de commandes (« on n'en a pas besoin »).
  Reste à trancher : « depuis la dernière synchro » (bouton de filtre ancré
  sur un instantané) et un journal global des déplacements.

**Amendé par l'ADR 052 (2026-09-30)** : la « décision éclair » écartée au
§5 revient sous une autre forme — la décision naît du geste (mise en pause,
requalification) dans la fiche « Décision et Raison ».
