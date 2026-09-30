# ADR 053 — Comparer un instantané avec maintenant

Date : 2026-09-30 · Statut : accepté · Complète l'ADR 042 (instantanés)

## Contexte

Après un réimport des mêmes fichiers, l'auteur voit des projets qu'il
n'avait pas avant : « ça bouge à chaque fois un petit peu ; j'ai vraiment la
pétoche ». Un instantané est pris avant chaque chargement (ADR 042) et
permet de revenir en arrière, mais rien ne disait **ce qui** avait changé :
le rapport de chargement ne donne que des nombres (créées, déplacées,
absentes).

## Décision

Dans le panneau Instantanés, chaque instantané gagne un bouton **« Comparer
avec maintenant »**. Le serveur reconstitue le tableau tel qu'il était à la
position du journal de l'instantané (ses cartes de base + les évènements
jusqu'à cette position) et le compare au tableau d'aujourd'hui, carte par
carte (`core/snapshot-diff.ts`, `GET /api/snapshots/:id/diff`) :
nouveaux projets, absents du dernier import (gardés, marqués ∅), disparus,
de retour, déplacés (colonne, et canal après la qualification), domaine,
type ou titre changés, archivés, désarchivés — chaque section avec son
compte, le code, le titre, « de → vers ».

C'est une lecture : rien n'est écrit. Revenir en arrière reste le geste
« Restaurer… », avec sa confirmation.

## Conséquences

- Après chaque import : Instantanés › « avant chargement AAAA » › Comparer
  avec maintenant — la liste exacte des projets entrés, sortis, déplacés.
- `core/snapshot-diff.ts` (+ tests), `middle/snapshots.ts` (+ test),
  `middle/app.ts`, `front/apiSnapshots.ts`, `front/components/
  SnapshotDiffView.tsx`, `adminSnapshots.tsx`, `AdminPanel.tsx`,
  `admin.css`.
