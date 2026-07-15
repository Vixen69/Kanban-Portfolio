# middle/ — API Express (RP1)

API **Express + TypeScript** au-dessus de `core/`, derrière le port
`BoardStorage` (ADR 010/011/016). Zéro egress. Six routes : `GET /api/config`,
`GET /api/config/default`, `PUT /api/config` (surcharge topologie, ADR 013),
`GET /api/board` (cartes de base + journal, repli côté client),
`POST /api/cards` (création locale), `POST /api/events` (le serveur fait
autorité sur id/horodatage/acteur).

- Logique métier dans `core/` ; Express n'enrobe que transport, validation
  et (à venir) auth. La logique d'API (`api.ts`) est transport-agnostique.
- Stockage via le port `BoardStorage` : pilote **PostgreSQL** (`pg`, ADR 016)
  — défaut en conteneur — et pilote **JSONL** sélectionnable en repli
  mono-instance. Journal append-only (trigger anti UPDATE/DELETE côté pg).
- En-têtes de sécurité sur chaque réponse (mêmes valeurs que la page nginx),
  plafond de corps 64 Kio, même origine (pas de CORS), journalisation par ids
  uniquement ; une erreur interne renvoie un message générique.
- Cible Node 22, exécuté directement via `node middle/main.ts` (type-stripping,
  **aucun build TS→JS**) ; conteneurisation faite (ADR 015), image middle en
  utilisateur non-root.
