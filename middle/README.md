# middle/ — API Express (RP1)

API **Express + TypeScript** au-dessus de `core/`, derrière le port
`BoardStorage` (ADR 010/011). Zéro egress. Routes : `GET /api/config`,
`GET /api/board` (cartes de base + journal, repli côté client),
`POST /api/events` (le serveur fait autorité sur id/horodatage/acteur).

- Logique métier dans `core/` ; Express n'enrobe que transport, validation
  et (à venir) auth. La logique d'API (`api.ts`) est transport-agnostique.
- Stockage via le port `BoardStorage` : pilote **JSONL** pour l'instant
  (Node 22 OK) ; pilote **PostgreSQL** (`pg`) à brancher derrière le même
  port une fois `pg` autorisé (ADR 011).
- En-têtes de sécurité sur chaque réponse, plafond de corps 64 Kio,
  même origine (pas de CORS), journalisation par ids uniquement.
- Cible Node 22 ; en dev, lancé via `node middle/main.ts` (type-stripping).
  Le build TS→JS et la conteneurisation sont finalisés au RP6.
