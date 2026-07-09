# ADR 016 — Adaptateur PostgreSQL (back end mandaté)

## Contexte

Le référent technique a autorisé l'appel à **PostgreSQL depuis le middle**
(2026-07-07). Le back PostgreSQL, mandaté depuis le début (ADR 011, CLAUDE.md
§3/§4), devient donc réalisable. Le stockage fichier JSONL (ADR 009/015) était
un stopgap le temps d'autoriser `pg` ; il est conservé comme pilote de repli
mono-instance, mais **Postgres devient le back end de livraison**.

## Décision

- **`pg` (node-postgres)** autorisé et installé (middle, `^8`). Client standard,
  mûr, **JS pur** (pas de build natif) — confiné à un seul fichier
  (`middle/storage/postgres.ts`) derrière le port `BoardStorage` ; un test de
  frontière (`scripts/architecture.test.ts`) vérifie que `pg` n'est importé
  **que** là.
- **Le port `BoardStorage` passe en asynchrone** : `pg` n'a pas d'API
  synchrone, donc les méthodes du port renvoient des `Promise`. Le pilote JSONL
  enveloppe son corps synchrone (un throw devient un rejet) ; les handlers du
  middle (`getBoard`/`postEvent`/`postCard`), `app.ts`, `main.ts` et `seed.ts`
  `await`. `core/` reste inchangé (le port est une interface).
- **Schéma** : `cards` (snapshot d'import, upsert par id, ordre par colonne
  identité) et `card_events` **append-only** (séquence bigint → ids
  `evt-<seq>`) ; un **trigger** interdit `UPDATE`/`DELETE` sur le journal
  (CLAUDE.md §4). SQL paramétré, **pas d'ORM**. Données stockées en `jsonb`
  (mêmes coercitions que le JSONL : `undefined` retiré, `NaN` → `null`).
- **Sélection** : `KANBAN_STORAGE_DRIVER` = `postgres` (défaut en conteneur) ou
  `jsonl` ; connexion via `DATABASE_URL` (sinon variables `PG*`).
- **Même contrat** : le pilote Postgres passe la **même suite de conformance**
  que le JSONL (`storage/postgres.test.ts`, vérifiée contre une base réelle,
  gardée par `KANBAN_PG_TEST_URL`), plus le test du trigger append-only.

## Conséquences

- `compose.yaml` : le service `db` (PostgreSQL 16) rejoint le profil `app` ;
  le middle s'y connecte (`DATABASE_URL`, `depends_on: healthy`). L'override de
  configuration admin reste fichier (petit volume `config-data`) — un stockage
  Postgres de la config serait une évolution ultérieure.
- La livraison n'exige plus qu'on tranche « fichier vs Postgres » : Postgres
  est le défaut, JSONL reste sélectionnable (mono-instance). Le seul point
  restant au référent est le **canal de livraison / registre**.
- Contrainte JSONL (écrivain unique) levée par Postgres : le middle peut être
  répliqué (plusieurs instances derrière la base).
- Le SBOM croît de l'arbre de `pg` (≈14 paquets, JS pur) — reflété dans
  `sbom.json` et `DEPENDENCIES.md`.
