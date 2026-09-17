# ADR 042 — Instantanés : figer le tableau avant un réimport, le restaurer sans rien effacer

Date : 2026-09-17 · Statut : accepté (demande de l'auteur)

## Contexte

Les réimports d'exports Sciforma vont se succéder (placement RDOM, RSP
pilote du 1er octobre). L'auteur veut « prendre un snapshot parce qu'on
sait qu'on va faire des réimports… pouvoir réimporter exactement ces
états-là à partir du snap… un garde-fou pour les personnes qui vont le
reprendre ». Le `pg_dump` du RUNBOOK reste la sauvegarde d'exploitation,
mais il demande un accès à la VM et une restauration hors de l'outil ;
le PMO a besoin d'un geste dans le tableau.

Le journal (`card_events`) est append-only : on ne peut pas « revenir en
arrière » en supprimant des lignes, et on ne le veut pas — le journal est
la vérité et la piste d'audit (§1, ADR 016).

## Décisions

1. **Un instantané fige ce que le journal ne porte pas**, avec la
   position du journal : les cartes de base (l'entrée du repli, ADR 002),
   la capacité de chaque exercice qui en a une, la configuration
   appliquée (ou son absence), l'année en cours, et `logSeq` = le numéro
   du dernier évènement à l'instant de la prise (`core/snapshot.ts`
   `BoardSnapshot`). Il porte un libellé (le pourquoi, obligatoire à la
   main) et l'acteur. Il est **gardé pour de bon** : pas de rétention.
2. **Restaurer n'efface rien.** La restauration remet les faits
   (`restoreCards` remplace les cartes de base en un lot, `importCapacity`
   par exercice capturé, `restoreOverride` remet ou retire la config
   appliquée avec une ligne d'historique notée, l'année en cours est
   remise) puis **ajoute un évènement `restored`** (cardId `*`, tableau
   entier ; payload `toSeq`, `snapshotId`, `label`). Le repli lit ensuite
   le journal à travers `core/restore.ts` `effectiveEvents` : les
   évènements écrits entre la position de l'instantané et la
   restauration sont **annulés** (gardés dans le journal, sortis de la
   lecture) ; ceux d'après s'appliquent. Les restaurations s'emboîtent
   (revenir à une position elle-même atteinte par une restauration se lit
   récursivement) ; une cible invalide est un no-op. La lecture est
   idempotente.
3. **Le journal est lu une fois, pour tous** : `foldEvents` applique le
   filtre ; le magasin du front expose `events` (lus) et `undone`
   (annulés) ; la fiche dit dans son Historique combien de gestes de la
   carte une restauration a annulés. Le repli ciblé de `postEvent`
   (ADR 040) lit toujours les évènements `*` avec ceux des cartes
   concernées.
4. **Un instantané automatique** avant chaque chargement d'import
   (« avant chargement <exercice> », acteur import, une fois le
   chargement accepté et juste avant qu'il n'écrive) et avant chaque
   bascule d'année (« avant bascule vers N+1 »).
5. **Le port** : `saveSnapshot`, `listSnapshots` (résumés, sans les
   cartes, du plus récent au plus ancien), `loadSnapshot`,
   `restoreCards`, `lastSeq`. Postgres : table `snapshots (id, summary,
   data)` créée au démarrage ; JSONL : enregistrements `snapshot` et
   `cards` (le remplacement des cartes de base, le fichier reste
   append-only). Routes : `GET /api/snapshots`, `POST /api/snapshots
   {label}`, `POST /api/snapshots/:id/restore` (sérialisée avec les
   intentions de cartes).
6. **L'écran** : ⚙ › onglet « Instantanés » — prendre (libellé
   obligatoire), la liste (date, libellé, cartes, exercice, position du
   journal, config appliquée ou modèle versionné), « Restaurer… » puis une
   confirmation explicite ; le panneau se ferme, config, tableau et
   capacité sont rechargés. Un autre navigateur qui reçoit l'évènement
   `restored` par le rafraîchissement incrémental recharge tout.

## Conséquences

- `core/restore.ts`, `core/snapshot.ts`, `core/event-sequence.ts`
  (`eventSequence` sorti de `state.ts` pour éviter un cycle), `core/types.ts`
  (`restored`), `core/ports.ts`, `core/state.ts` ; `middle/snapshots.ts`,
  `middle/storage/{jsonl,jsonl-format,postgres}.ts`, `middle/config-store.ts`
  (`getOverride`, `restoreOverride`), `middle/exercise.ts`,
  `middle/import.ts` (`LoadHooks.beforeWrite`), `middle/app.ts`,
  `middle/api.ts` ; `front/apiSnapshots.ts`, `front/useAdminWrites.ts`,
  `front/adminWrites.ts`, `front/useDetailProjection.ts`,
  `front/components/adminSnapshots.tsx`, `AdminPanel.tsx`, `CardDetail.tsx`,
  `DetailSections.tsx`, `useBoardStore.ts`, `admin.css`. Tests : cœur
  (filtre, emboîtement, cibles invalides, repli), JSONL, middle (prise,
  restauration, routes, config store, instantané automatique de la
  bascule).
- Limite connue : la capacité d'un exercice importé APRÈS l'instantané et
  absent de celui-ci n'est pas retirée par la restauration (les cartes de
  cet exercice, elles, disparaissent) ; le prochain import de l'exercice
  la remplace.
- Le `pg_dump` garde sa place : c'est la sauvegarde hors de l'outil (VM
  perdue, base corrompue). L'instantané est le garde-fou du geste métier.
