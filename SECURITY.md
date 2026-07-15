# Posture de sécurité

Document de référence pour la revue par un officier de sécurité.
État : **re-plateformage en cours (2026-06-19)** vers la plateforme
conteneurisée du client — front React 18 / Vite, middle Node / Express,
back PostgreSQL, le tout en conteneurs Docker. Les Sprints 1-3 (validation du
produit, des ports et du modèle évènementiel) ont été réalisés sur la pile
minimaliste initiale ; `core/` et la logique d'API sont repris tels quels.

## Principes permanents

- **Déploiement on-premise uniquement**, dans la plateforme du client. Pas de
  cloud, pas de SaaS, aucun service runtime externe.
- **Zéro egress** de l'application web à l'exécution. Aucune télémétrie, aucun
  CDN, aucune police distante, aucun actif distant : tout est embarqué dans
  l'image conteneur.
- **Comptes locaux, rôles câblés en dur** (viewer/editor/admin). Pas de LDAP,
  pas d'auto-inscription : l'administrateur crée les comptes (CLI, pas d'IHM de
  réglages).
- Les journaux ne contiennent ni titres de cartes ni valeurs financières,
  uniquement des identifiants.
- Données : données de l'industrie de défense, **non classifiées**,
  hébergement local uniquement.

## Surface de dépendances

- La surface est le **SBOM autorisé du client** (plafond fixé par le référent
  technique ; voir `DEPENDENCIES.md`). On reste dans les versions autorisées
  et on n'emploie que le nécessaire.
- Le seul ajout runtime hors liste initiale, le client PostgreSQL **`pg`**, a
  été **autorisé par le référent (2026-07-07)** et installé (ADR 016) ; il est
  confiné à son adaptateur (`middle/storage/postgres.ts`, test de frontière).
- Hachage des mots de passe par **`scrypt` de `node:crypto`** (module natif,
  aucune dépendance ajoutée, préféré à bcrypt/argon2).

## Authentification et sessions (RP3)

- **JWT** (`jsonwebtoken`) transporté dans un **cookie httpOnly +
  SameSite=Strict** (et `Secure` derrière TLS). Un interrupteur explicite
  `INSECURE_COOKIES` retire `Secure` pour un réseau LAN verrouillé en HTTP
  simple — à n'utiliser qu'avec un accès réseau restreint.
- Le cookie httpOnly garde le jeton hors de portée de JavaScript/XSS (choisi
  plutôt qu'un en-tête Bearer + stockage côté client).
- Le serveur est **autorité** sur l'`id`, l'horodatage et l'acteur des
  évènements ; l'acteur passe de « anonymous » à l'utilisateur authentifié
  (durcissement de la piste d'audit).
- Durée de vie / rafraîchissement du jeton : à fixer au RP3.

## Stockage et intégrité

- **PostgreSQL**. Identifiants de base et de synchronisation dans des fichiers
  d'environnement/secrets **hors dépôt**, référencés par chemin (dotenv).
- Le journal d'évènements (`card_events`) est **append-only** : à la fois
  piste d'audit et source unique des métriques de flux. L'append-only est
  défendu au niveau du schéma par un **trigger** interdisant UPDATE/DELETE.
  Portée : ce garde-fou arrête la réécriture par la voie SQL applicative ; il
  n'est pas inviolable face à un accès direct au fichier ou à la base.
- **Interrupteur de démo** `KANBAN_PG_APPEND_ONLY=0` : retire le trigger pour
  autoriser des retouches directes en base (démo/dev via Adminer). **Doit
  rester à `1` en production** (défaut du code et du compose). Le lanceur
  « Lancer en Docker.cmd » le met à `0` — c'est un raccourci de démo local, pas
  la configuration de livraison.
- **L'intégrité repose in fine sur le contrôle d'accès à la plateforme/VM**
  (réseau, moindre privilège) et les solutions propres du client. Le chaînage
  de hachés (preuve d'inviolabilité applicative) a été **écarté** sur cette
  base — l'authentification applicative reste additive par-dessus.

## Durcissement du web (implémenté)

En-têtes de sécurité posés à **deux points** — la page HTML est servie par
nginx (front), l'API JSON par Express (middle) — avec la **même politique** de
part et d'autre (à garder en phase : `docker/nginx.default.conf.template` et
`SECURITY_HEADERS` dans `middle/app.ts`) :

- **CSP** : `default-src 'self'` ; `script-src 'self'` ; `style-src 'self'
  'unsafe-inline'` (l'UI pose des variables CSS de vieillissement) ;
  `object-src 'none'` ; `frame-ancestors 'none'` ; `base-uri`/`form-action`
  `'self'`. La page ajoute `img-src`/`font-src … data:` pour les actifs inline
  du build Vite.
- En-têtes posés **explicitement** (pas de `helmet`) : `X-Content-Type-Options:
  nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy:
  same-origin`, `Permissions-Policy` restrictif ; `server_tokens off` sur nginx.
- **Même origine** : aucun en-tête CORS émis par le middle — front et middle
  partagent l'origine (reverse-proxy), donc rien à autoriser en cross-origin.
  `cors` est disponible dans le SBOM mais non utilisé.
- Plafond de corps de requête **64 Kio** (Express + nginx), délais de requête
  (anti slow-loris), validation de chaque intention POST contre la topologie
  (rejet en 400) ; une erreur interne renvoie un message générique — jamais
  chemins/SQL/titres (testé).
- Journalisation : `card_id` / id d'évènement et message uniquement ; jamais
  un objet carte/évènement ni un corps de requête.

## Durcissement des conteneurs (implémenté)

- **Middle non-root** : le process Express tourne en utilisateur `node` ; les
  volumes de données lui appartiennent (`docker/Dockerfile.middle`).
- **Images de base épinglées par digest** (`node`, `nginx`, `postgres`,
  `adminer`) — build reproductible, le tag ne bouge pas sous nos pieds.
- **Ports publiés liés à la loopback** (`127.0.0.1`) dans le compose : l'API
  non authentifiée (auth = RP3) et la base (mot de passe de dev) ne sont pas
  joignables au-delà de la machine ; l'accès passe par le front en même origine.
- **`pg` Pool** : un écouteur `error` empêche qu'un incident de base au repos
  (redémarrage, bascule) ne fasse tomber le process middle.

## Build vérifiable et livraison

- Surface de dépendances = SBOM autorisé ; build d'image **reproductible**.
- Génération d'un SBOM (p. ex. CycloneDX) à l'étape de build de l'image quand
  c'est possible.
- Livraison par **image conteneur** dans la plateforme/registre du client
  (canal exact à confirmer avec le référent). Remplace l'ancien rituel
  d'installation hors-ligne et de comparaison sha256 fichier par fichier.
- La machine de développement ne voit **que** des données synthétiques
  (adaptateur `fixtures`). Aucune donnée client réelle n'y entre.

## À venir (phases de re-plateformage)

- RP3 : comptes locaux (`scrypt`), rôles, sessions JWT-cookie, durcissement
  d'audit.
- RP4 : synchronisation PPM en processus séparé (`sync/`), lecture seule,
  jamais le middle web ; identifiants en fichier restreint hors dépôt.

## Signalement

Projet interne — signaler tout problème au propriétaire du dépôt.
