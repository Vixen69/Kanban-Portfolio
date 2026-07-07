# ADR 009 — Pilote de stockage de repli JSONL

> **Statut (ADR 011)** : le pilote **JSONL est aujourd'hui le pilote actif**
> (et non plus un simple repli — `node:sqlite` retiré, ADR 008/011). Il tourne
> en conteneur sur un volume `/data` (ADR 015). PostgreSQL via `pg` à venir.

## Contexte

Le pilote primaire est `node:sqlite` (ADR 008), qui exige Node 24 LTS
≥ 24.15. La version de Node sur la VM cliente reste une décision ouverte
(CLAUDE.md §12) : si elle est inférieure, ou si `node:sqlite` y est jugé
inacceptable par la revue de sécurité, il faut une porte de sortie qui ne
dépende d'aucun binaire natif ni d'aucune version précise de Node. Le port
`BoardStorage` a été conçu au niveau dépôt précisément pour rendre ce repli
possible (ADR 008).

## Décision

- Un second pilote, `server/storage/jsonl.ts`, implémente le **même port
  `BoardStorage`** sur un simple fichier **JSONL** (un objet JSON par ligne) :
  zéro dépendance, lisible par un humain, exécutable sur n'importe quel Node.
- **Append-only par discipline** : le pilote n'ajoute que des lignes, il ne
  réécrit jamais un enregistrement validé. Ligne 1 = en-tête versionné
  (`{kind:"header", format, version}`) ; puis un enregistrement `card` par
  instantané importé, un enregistrement `event` par événement. L'entier
  `seq` reproduit celui de SQLite, donc les ids restent `evt-<seq>`.
- **Reprise sur incident** : à l'ouverture, une **ligne finale incomplète**
  (écriture interrompue par un crash) est tronquée — c'est une reprise, pas
  une réécriture de l'historique validé. Une ligne corrompue **non finale**
  est refusée (corruption réelle). En-tête absent ou de version non
  supportée : refus explicite (message français).
- **Atomicité d'un lot** : `importCards` sérialise toutes les lignes (cartes
  puis événements) **avant** la moindre écriture ; un payload non
  sérialisable échoue donc sans rien laisser sur le disque. Chaque écriture
  est suivie d'un `fsync`.
- **Écrivain unique** : pas de verrouillage inter-processus. Un seul
  processus écrit à la fois (le serveur ; ou la synchro du Sprint 5, jamais
  les deux en parallèle sur ce pilote). Lecture et fold se font en mémoire,
  reconstruits à l'ouverture.
- Sélection **explicite** via la configuration (`select.ts`, id `jsonl`),
  jamais d'auto-bascule depuis SQLite.

## Conséquences

- Ceci **amende CLAUDE.md §3** (« Storage: SQLite ») : le repli JSONL est
  désormais un mode de stockage permis, sans dépendance, derrière le même
  port. SQLite reste le mode primaire.
- La **suite de conformité** (`conformance.test.ts`) s'exécute à l'identique
  contre les deux pilotes : la réversibilité du choix de stockage est
  prouvée par test, pas seulement déclarée.
- Mêmes limites d'intégrité que SQLite : l'append-only protège de la
  réécriture par le pilote, pas d'un processus ayant accès au fichier ;
  la frontière reste les permissions du système de fichiers (ADR 008).
- Limite assumée : pas d'accès concurrent multi-processus ni d'index ; le
  fold est O(n événements) en mémoire, acceptable à l'échelle visée
  (≈10² cartes, ≈10³ événements). Si ces limites deviennent gênantes,
  `node:sqlite` est le mode primaire à privilégier.
