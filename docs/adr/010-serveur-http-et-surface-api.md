# ADR 010 — Serveur node:http et surface de l'API

> **Supersédé quant au transport par l'ADR 011** : le serveur `node:http`
> devient **Express**. La **logique d'API et la surface** décrites ici
> (`/api/*`, autorité serveur sur id/horodatage/acteur, en-têtes de sécurité,
> même-origine) **subsistent**, portées inchangées dans Express (ADR 011).

## Contexte

Le Sprint 3 expose le tableau via HTTP : le serveur sert le frontend statique
construit (`dist/`) et une petite API au-dessus du port `BoardStorage`
(ADR 008/009). C'est la première surface réseau du produit ; elle est donc la
plus scrutée par l'officier de sécurité. Contraintes : `node:http` seul, aucun
framework (CLAUDE.md §3), zéro egress (§2), journaux sans données de carte (§6).
ADR 008 avait renvoyé l'horodatage, l'acteur et la validation topologique « à
l'appelant (serveur HTTP) » : c'est ici.

## Décision

- Trois routes JSON, plus le service statique :
  - `GET /api/config` — la topologie validée (`validateBoardConfig`).
  - `GET /api/board` — `{ cards, events }` : instantanés importés + journal
    complet ; **le client replie** (fold) pour obtenir l'état courant (ADR 002).
  - `POST /api/events` — le client exprime une **intention** (`type`, `cardId`,
    `toLaneId`/`toColumnId`, `reason`, `patch`) ; il ne fabrique jamais la forme
    stockée.
  - Tout le reste → service statique de `dist/` (repli SPA sur `index.html`
    pour les routes sans extension), confiné à la racine (anti-traversée).
- **Autorité du serveur.** L'`id`, le `ts` (horloge serveur) et l'`actor` sont
  attribués par le serveur — jamais lus du corps. `actor` vaut `"anonymous"`
  jusqu'au Sprint 4 (auth). Pour un `moved`, la colonne/canal d'origine est
  **dérivée de l'état replié**, pas fournie par le client.
- **Liste blanche de types.** Seuls `moved` / `blocked` / `unblocked` /
  `edited` sont acceptés. `created` / `imported` relèvent de l'import et de la
  synchro, jamais de l'UI. Les champs d'un `patch` d'édition sont filtrés
  contre `EDITABLE_FIELDS` (le fold n'itère que la liste blanche, jamais les
  clés du payload — protection contre les clés héritées type `constructor`).
- **En-têtes de sécurité** sur **toute** réponse : `Content-Security-Policy:
  default-src 'self'` avec `script-src 'self'` et `style-src 'self'
  'unsafe-inline'` (l'UI pose des `style=` en ligne pour le vieillissement —
  §5), `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
  `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy` fermant
  géoloc/caméra/micro/paiement/usb. Pas de CORS (même origine uniquement).
- **Robustesse.** Corps limité à 64 Kio (au-delà : 413, sans détruire la
  socket pour que la réponse parvienne) ; `requestTimeout`/`headersTimeout`
  contre le slow-loris ; erreurs mappées 400/413/500 ; les 500 journalisent
  message + contexte (ids), jamais le corps.
- **Configuration** non secrète par variables d'environnement (`KANBAN_HOST`
  défaut `127.0.0.1`, `KANBAN_PORT`, `KANBAN_STORAGE_DRIVER`, chemins) ;
  aucun secret ici (§6). Arrêt propre : fermeture serveur puis stockage (le
  checkpoint WAL s'exécute), avec minuterie de secours.

## Conséquences

- L'UI bascule au Sprint 3.4 : `fetch` même origine vers ces routes, le fold
  reste côté client (diff minimal). `created`/`imported` n'étant pas postables,
  l'UI ne peut pas fabriquer de cartes — conforme au produit.
- `script-src 'self'` (sans `'unsafe-inline'`) était à vérifier contre le
  `dist/index.html` réel. **Vérifié au Sprint 3.4** : `vite.config.ts` pose
  `build.modulePreload.polyfill: false`, et le `dist/index.html` produit ne
  contient qu'un `<script src=...>` externe, aucun script en ligne — la CSP
  stricte tient sans hash ni `'unsafe-inline'`.
- `SECURITY.md` est mis à jour : le Sprint 3 passe de « à venir » à livré.
