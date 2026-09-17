# ADR 040 — Sprint de perf : mesurer d'abord, puis un journal qui ne se renvoie plus en entier

Date : 2026-09-17 · Statut : accepté (demande de l'auteur : « sprint de perf »)

## Contexte

Avant de toucher au code, on a mesuré. Le cœur (`scripts/bench-perf.ts`,
`npm run bench`) sur le tableau de dev — 155 cartes, 783 évènements — et
le même journal grossi artificiellement à 10 000 et 50 000 évènements :

| Mesure (médiane) | 783 évts | 10 000 | 50 000 |
|---|---|---|---|
| Repli du journal (`foldEvents`) | 0,9 ms | 2,2 ms | 8,5 ms |
| Une frappe de filtre (`hiddenCardIds` + compteurs) | 0,2 ms | 0,1 ms | 0,1 ms |
| Totaux colonnes + canaux + tableau | 0,2 ms | 0,2 ms | 0,1 ms |
| Historique + délais d'une fiche | 0,1 ms | 0,5 ms | 2,6 ms |
| Flux (débit, encours, blocages) | 0,6 ms | 1,9 ms | 6,4 ms |
| Temps par étape (`stageDwell`) | 0,7 ms | 9 ms | 44 ms |
| Lecture de capacité | 0,6 ms | 0,3 ms | 0,2 ms |
| Sérialisation JSON du journal | 0,9 ms | 10,7 ms | 57,5 ms |
| **Charge utile du journal** | **157 Ko** | **2 Mo** | **10 Mo** |

L'audit d'import sur un COUT PREV de 10 800 lignes : 250 à 450 ms.

Dans le navigateur, build de production, 155 cartes : 33 à 50 ms par
frappe de filtre, 67 ms pour remonter les 155 cartes, 274 ms de chargement
complet, 11 ms pour lire le tableau (299 Ko, gzippé par nginx sur la VM).

**Conclusion des mesures** : le calcul est loin d'être le problème. Le
seul coût qui grossit sans limite est la **charge utile du journal** :
chaque action du front (déplacer, commenter, décider…) renvoyait le
journal entier, et le serveur repliait le journal entier pour valider
chaque intent. À 50 000 évènements, c'est 10 Mo lus et transmis par
déplacement de carte.

## Décisions

1. **Le journal ne se renvoie plus en entier après une action.** Nouvelle
   route `GET /api/events?after=N` : les évènements de séquence strictement
   supérieure à N, dans l'ordre. Après SES propres écritures, le front ne
   demande que la suite du journal et l'ajoute à ce qu'il tient
   (`useBoardStore` `useRefresh`). Les instantanés de cartes ne changent
   qu'à l'import, qui recharge tout — comme la config, la bascule
   d'exercice et l'ouverture de la page. Une lecture incrémentale qui
   échoue retombe sur le rechargement complet. Le serveur reste la vérité :
   rien n'est ajouté localement avant d'avoir été lu dans le journal.
2. **La validation d'un intent ne replie que les cartes concernées.**
   `BoardStorage.listEvents(filter?)` accepte `afterSeq` et `cardIds`
   (`core/ports.ts` `EventFilter`) ; JSONL filtre en mémoire
   (`core/event-filter.ts`), Postgres traduit en `WHERE` avec un index sur
   `data->>'cardId'`. `postEvent` lit les évènements de la carte visée et,
   pour un dépôt sur une autre carte, de la cible d'insertion — jamais le
   journal entier.
3. **Les tickets sont mémoïsés** (`React.memo` sur `MiniCard` et
   `FocusCard`) : une frappe de filtre ou le tic d'horloge ne re-rend que
   les tickets dont les props changent. Les objets carte gardent leur
   identité entre deux replis, les callbacks sont des hooks stables.
4. **Le banc de mesure reste dans le dépôt** (`npm run bench`), sans
   assertion : un outil de mesure, à relancer avant tout prochain sprint.

## Conséquences

- `core/ports.ts` (`EventFilter`), `core/state.ts` (`eventSequence`
  exporté), `core/event-filter.ts`, `middle/storage/jsonl.ts` et
  `postgres.ts` (filtre, index), `middle/reads.ts` (`getEvents`,
  `getCapacity` sortis d'api.ts), `middle/api.ts` (`postEvent` ciblé),
  `front/api.ts` (`fetchEventsAfter`), `front/useBoardStore.ts`
  (`useRefresh`), `front/components/cards.tsx` (memo),
  `scripts/bench-perf.ts`. Tests : filtre JSONL et Postgres, route
  `/api/events`, repli ciblé de `postEvent`, client front.
- Le chargement initial transmet toujours le journal entier : le front
  replie lui-même (ADR 002). À 50 000 évènements, 10 Mo, 1 Mo gzippé — à
  surveiller ; le pas suivant serait un repli côté serveur, décision à
  prendre le jour où le journal le demande.
- Non retenu : optimiser `stageDwell` (44 ms à 50 000 évènements, calculé
  une fois à l'ouverture des analytics).
