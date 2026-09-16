# ADR 038 — Le modèle versionné passe devant la configuration appliquée ; l'exercice en cours a son propre fichier ; la bascule d'année

Date : 2026-09-16 · Statut : accepté (décisions de l'auteur, soirée)

## Contexte

Sur la VM, l'auteur a retiré le domaine SUPPORT OFFICE depuis le panneau
⚙ : la configuration appliquée (ADR 013) gagnait alors sur tout, et le
domaine PROJETS VENDUS ajouté dans `config/board.json` n'apparaissait pas.
Sa règle : « tant qu'on est là, en tant que dev, on est plus important que
les configs appliquées ; une fois livré, les configs seront plus
importantes, mais nous, on ne sera plus là ». Il demandait aussi où était
le bouton « l'année dernière est archivée, on passe d'année » : il n'existait
pas encore (ADR 035, séance C).

## Décisions

1. **Une configuration appliquée n'est adoptée que tant que le modèle
   versionné sur lequel elle a été appliquée n'a pas changé.** Le fichier
   `<data>/config.json` porte désormais l'empreinte (sha256) de
   `config/board.json` au moment du clic « Appliquer ». Au démarrage, si
   l'empreinte diffère (un correctif des développeurs), la configuration
   appliquée est **écartée** : une ligne dans `config-history.jsonl` la
   conserve (acteur « modèle versionné », note explicite), le fichier est
   retiré, la console le dit. Un ancien fichier sans empreinte est écarté
   une fois. Après livraison, personne ne modifie plus `board.json` : la
   configuration appliquée reste alors la référence.
2. **L'exercice en cours vit à part**, dans `<data>/exercise.json`
   (`{ year, actor, ts }`, historique `exercise-history.jsonl`), superposé
   à `exercise.year` de toute configuration servie. Ainsi ni un correctif
   du modèle versionné ni une configuration appliquée ne ramènent l'année
   en arrière. `sync/cloture.ts` écrit désormais là.
3. **La bascule d'année** : `POST /api/exercise/switch { year }`, refusée
   sauf pour l'année qui suit l'exercice en cours. Le serveur calcule le
   plan sur le tableau replié (`core/exercise-switch.ts`) et écrit ses
   évènements en un lot, puis enregistre l'année : (1) chaque carte sans
   année est **épinglée** sur l'année qui se clôt (`edited { exercise }`)
   avant que l'année en cours ne change sous elle ; (2) chaque carte active
   de l'année qui se clôt est **archivée** ; (3) chaque carte de la nouvelle
   année est **activée** (`activated`) — son horloge démarre ce jour-là.
   Rien n'est supprimé, rien ne bouge.
4. **Où** : panneau ⚙ › onglet **Exercice** : année en cours, année
   suivante, ce que la bascule fera sur ce tableau (épinglées, archivées,
   activées), une case de confirmation, le bouton « Passer à l'exercice
   N+1 ». Après la bascule, l'en-tête suit la nouvelle année.
5. **Une année close se lit telle qu'elle était** : sur un exercice clos, le
   tableau montre aussi ses cartes archivées (elles l'ont été à la bascule).
6. **En-tête** (usabilité, sur la proposition de l'auteur) : un bouton
   **« Analytics »** en toutes lettres — ouvert à chaque revue — et un menu
   **« ⋯ »** pour les gestes rares : Archives (avec le compte), Importer un
   export PPM, Configuration du tableau.

## Conséquences

- `middle/config-store.ts` (empreinte, `adopt`, `getExerciseYear` /
  `setExerciseYear`), `middle/exercise.ts` (route), `core/exercise-switch.ts`
  (+ tests), `front/components/adminExercise.tsx`, `HeaderMenu.tsx`,
  `AdminPanel.tsx`, `Chrome.tsx`, `useBoardStore.ts` (`switchExercise`),
  `useDisplayCards.ts` (l'en-tête suit l'année en cours), `App.tsx`.
- RUNBOOK : la règle du modèle versionné (ré-appliquer depuis ⚙ si une
  configuration écartée doit revenir) et la procédure de bascule.
- Toujours ouvert (§12) : verrouiller ou non l'édition d'une année close.
