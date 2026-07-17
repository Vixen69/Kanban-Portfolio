# Livraison — Portefeuille DSI · Kanban NMO

Dossier de remise à l'équipe plateforme du client. L'outil est **développé en
externe** (machine de l'auteur) puis **livré conteneurisé**, dans le **plafond
SBOM** autorisé. Ce document décrit ce qui est livré, comment le construire, le
lancer, le vérifier, et les deux points à trancher avec le référent technique.

> **En une phrase** : deux images de conteneur (un front nginx statique, un
> middle Express) construites depuis ce dépôt, servies en **même origine**
> (le front proxifie `/api` vers le middle), **zéro egress**, dépendances
> **dans le plafond SBOM**, conteneurs **durcis** (en-têtes de sécurité sur la
> page et l'API, middle non-root, images épinglées par digest, ports loopback),
> avec un **SBOM CycloneDX** livré à côté.

---

## 1. Ce qui est livré

| Livrable | Contenu | Base image |
|---|---|---|
| **Image `front`** | Bundle React 18 statique (Vite) servi par nginx + proxy `/api` → middle (même origine) | `nginx:1.27-alpine` |
| **Image `middle`** | API Express (TypeScript exécuté directement par Node 22.18) + `config/board.json` + son propre `sbom.json` | `node:22.18-alpine` |
| **`sbom.json`** | Nomenclature CycloneDX 1.5 (générée depuis `package-lock.json`), aussi embarquée dans l'image middle (`/app/sbom.json`) | — |
| **Source** | Ce dépôt (monorepo workspaces `core/ middle/ front/`), `package-lock.json` commité, `verify.sh` | — |

Le client peut soit **recevoir les images** (+ le SBOM), soit **recevoir la
source** et construire/auditer lui-même — la construction est reproductible
(`npm ci`, images épinglées).

## 2. Prérequis

- **Docker** (Desktop ou Engine) + Docker Compose v2 pour construire/lancer les images.
- Pour construire depuis la source sans Docker (ou pour semer les données de
  test) : **Node ≥ 22.18** (voir `.nvmrc`) et `npm ci` à la racine.

## 3. Construire les images

Depuis la racine du dépôt :

```bash
docker compose -f docker/compose.yaml --profile app build
```

Ce que fait chaque image (voir `docker/Dockerfile.front` / `.middle`) :

- **front** : `npm ci` → `npm run --workspace front build` (tsc + vite) →
  copie de `front/dist` dans nginx, plus le gabarit de proxy
  `docker/nginx.default.conf.template` (les variables `MIDDLE_HOST`/
  `MIDDLE_PORT` sont substituées au démarrage du conteneur).
- **middle** : `npm ci --omit=dev` → copie de `core/ middle/ config/` →
  génération du `sbom.json` → `CMD node middle/main.ts`. **Pas d'étape de
  compilation** : le middle exécute son TypeScript directement (Node 22.18,
  *type stripping*), exactement comme `npm run serve` en dev (ADR 015).

> ✓ La pile Docker durcie a été **construite et lancée de bout en bout**
> (2026-07-15) : `docker compose --profile app up -d --build` → `db` *healthy*,
> `middle` non-root (`whoami`=`node`) sur `postgres`, `front` nginx :8080
> servant **150 cartes** via le proxy même-origine, en-têtes de sécurité
> présents sur la page, rendu **sans violation CSP**. Le runbook de la
> section 8 reproduit cette vérification.

## 4. Lancer

```bash
docker compose -f docker/compose.yaml --profile app up
```

- **Front** : http://localhost:8080 (nginx). Tout appel `/api/*` est proxifié
  vers le middle en même origine. Ports publiés liés à la **loopback**
  (`127.0.0.1`) — rien n'est exposé au-delà de la machine.
- **Middle** : http://localhost:8787 (Express), en utilisateur **non-root**.
  Stockage **PostgreSQL** par défaut dans la pile compose (service `db`) ;
  JSONL sur volume `/data` en repli si `KANBAN_STORAGE_DRIVER=jsonl`.

### Configuration (variables d'environnement du middle, `middle/config.ts`)

| Variable | Défaut | Rôle |
|---|---|---|
| `KANBAN_HOST` | `0.0.0.0` (image) | Interface d'écoute |
| `KANBAN_PORT` | `8787` | Port |
| `KANBAN_STORAGE_DRIVER` | `jsonl` (image) · `postgres` (compose) | Pilote : `postgres` ou `jsonl` |
| `DATABASE_URL` | — | Connexion PostgreSQL (pilote `postgres`) ; **secret hors dépôt** |
| `KANBAN_PG_APPEND_ONLY` | `1` | Trigger append-only du journal ; `0` = démo (retire le garde-fou) — **garder `1` en production** |
| `KANBAN_DATA_PATH` | `/data/board.jsonl` (image) · `/app/data/board.jsonl` (compose) | Fichier JSONL + dossier de la surcharge de config (ADR 013) |
| `KANBAN_CONFIG_PATH` | `config/board.json` | Topologie par défaut (dans l'image) |

**Secrets** : aucun n'est dans l'image (CLAUDE.md §6). Les identifiants (DB,
sync) arriveront par fichier/secret monté hors dépôt, référencés par chemin.

### Exposer aux autres postes (mode réseau, opt-in explicite)

Par défaut, **rien n'est joignable depuis le réseau** (tous les ports publiés
sont liés à `127.0.0.1`). Pour servir d'autres postes, on ouvre **uniquement le
front** (nginx) — le middle, la base et Adminer restent en loopback, tout accès
passe par le front en même origine :

- **Le plus simple** : double-cliquer **« Lancer en Docker (reseau).cmd »** —
  il relance la pile avec le front sur toutes les interfaces, tente d'ajouter
  la règle de pare-feu entrante (port 8080), et affiche les adresses à
  communiquer (`http://<ip-du-poste>:8080`).
- En ligne de commande : `FRONT_BIND=0.0.0.0 docker compose -f
  docker/compose.yaml --profile app up -d` (+ règle de pare-feu entrante
  TCP 8080 si besoin).
- Retour en local seul : relancer sans `FRONT_BIND` (ou via
  « Lancer en Docker.cmd »).

> ⚠️ **Pas d'authentification avant RP3** : tout poste qui joint le port 8080
> peut lire **et modifier** le tableau. À réserver à un segment réseau
> restreint/maîtrisé (c'est la posture documentée : contrôle d'accès réseau,
> l'auth applicative arrive en RP3). Sur la plateforme du client, l'équivalent
> propre est l'ingress/reverse-proxy de la plateforme routant vers le port 80
> du conteneur front, sans publier d'autre port.

Proxy front (`docker/Dockerfile.front`) : `MIDDLE_HOST` / `MIDDLE_PORT` (défaut
`middle` / `8787`) — à ajuster si le service middle porte un autre nom sur la
plateforme.

## 5. Le SBOM

- Généré par `npm run sbom` (ou `node scripts/sbom.ts`) → `sbom.json`
  (**CycloneDX 1.5**, ~202 composants). Reproductible : lu depuis
  `package-lock.json`, sans horodatage ni donnée d'environnement.
- L'image middle **embarque son propre `/app/sbom.json`** (généré pendant la
  construction, depuis son propre lockfile) — auditable dans le conteneur.
- **Surface réelle** : `core/` est **sans dépendance** ; runtime = **express**
  + **`pg`** (middle) + **react/react-dom** *bundlés* (front, aucun node_modules
  livré côté front). Le reste du plafond (cors, cookie-parser, jsonwebtoken,
  dotenv, design-system front…) est **autorisé mais pas encore installé**
  (auth = RP3).

## 6. Stockage : PostgreSQL (JSONL en repli)

Le middle est **event-sourced** : la vérité est un **journal append-only**.
Back end de livraison : **PostgreSQL** (`pg` autorisé — ADR 016), derrière le
port `BoardStorage` (`middle/storage/postgres.ts`). Schéma : `cards` + le
journal **append-only** `card_events` (un trigger interdit UPDATE/DELETE) ; SQL
paramétré, **pas d'ORM**, données en `jsonb`. Sélection par
`KANBAN_STORAGE_DRIVER` : `postgres` (défaut en conteneur) ou `jsonl`.

- Le compose lance **`db` (PostgreSQL 16) + `middle` + `front`** ; le middle s'y
  connecte via `DATABASE_URL` (`depends_on: healthy`). Le pilote passe la même
  suite de conformance que le JSONL, plus le test du trigger append-only.
- **Repli JSONL** : pilote fichier mono-instance (`KANBAN_STORAGE_DRIVER=jsonl`
  + volume durable sur `/data`) pour un déploiement simple sans base.
- Postgres lève la contrainte mono-instance : le middle peut être répliqué.

## 7. À confirmer avec le référent technique (un point)

- **Le canal de livraison / registre d'images** dans la plateforme (push
  registre, tarball d'image, Git interne) — encore non fixé.

`pg` est autorisé (ADR 016) ; le stockage n'est plus un arbitrage. Tout le
reste est déjà dans les versions autorisées.

## 8. Tester en local avec Docker (avant d'en parler au client)

Runbook pas-à-pas, depuis la **racine du dépôt** sur ta machine (Windows).
Objectif : construire, lancer et voir les 150 cartes + la fiche v10.

**a. Installer Docker Desktop** (si absent) et le démarrer. Vérifier :
```bash
docker --version && docker compose version
```

**b. Générer le SBOM** (livré à côté des images) :
```bash
npm run sbom
```

**c. Construire et lancer** (db PostgreSQL + middle + front) :
```bash
docker compose -f docker/compose.yaml --profile app up -d --build
```
Le middle attend que la base soit *healthy*, puis affiche
`kanban middle: http://0.0.0.0:8787 (postgres)`.

**d. Semer des données de démonstration dans la base** (fixtures — test local
uniquement ; en production la base est peuplée par l'import/sync du client ; le
port 5432 de la base est publié par le compose) :

PowerShell :
```powershell
$env:KANBAN_ALLOW_SEED="1"; $env:KANBAN_STORAGE_DRIVER="postgres"; $env:DATABASE_URL="postgres://kanban:thuglife@localhost:5432/kanban"; npm run seed
```
Bash :
```bash
KANBAN_ALLOW_SEED=1 KANBAN_STORAGE_DRIVER=postgres DATABASE_URL=postgres://kanban:thuglife@localhost:5432/kanban npm run seed
```
Attendu : `seed: 150 cartes, 768 évènements importés.`

**e. Vérifier dans le navigateur** : ouvrir **http://localhost:8080**
- Le plateau affiche **150 cartes**, sans défilement.
- Cliquer une colonne pour la focaliser, puis une carte → la **fiche détail**
  montre les sections v10 : *plan de charge par profil*, *risque de contention*,
  *budget · graphe croisé (RDLI)*, *risques & alertes*.
- Éditer un champ en ligne (ex. une alerte) → il persiste après rechargement
  (round-trip par évènement, écrit dans PostgreSQL).

Contrôle API direct via le proxy (optionnel) :
```bash
curl -s http://localhost:8080/api/board | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const b=JSON.parse(d);console.log('cartes',b.cards.length,'évts',b.events.length)})"
```

**f. Arrêter / nettoyer** :
```bash
docker compose -f docker/compose.yaml --profile app down       # garde la base
docker compose -f docker/compose.yaml --profile app down -v    # efface aussi la base
```

### Si ça coince
- **Page blanche / erreurs `/api`** : le proxy front ne joint pas le middle —
  vérifier que `middle` tourne (`docker compose … ps`).
- **Plateau vide** : la base n'a pas été semée (d) — le middle sert un plateau
  vide (aucune erreur).
- **Middle en redémarrage** : il attend la base ; vérifier `db` *healthy*
  (`docker compose … ps`).

## 9. Checklist de livraison

- [ ] `bash verify.sh` vert (conventions, typecheck ×3, tests, build front, SBOM).
- [ ] Suite Postgres verte contre une base réelle : `KANBAN_PG_TEST_URL=… node --test middle/storage/postgres.test.ts`.
- [ ] `npm run sbom` régénéré ; `sbom.json` (incl. l'arbre `pg`) joint à la livraison.
- [ ] `docker compose --profile app build` réussit sur une machine Docker.
- [ ] `--profile app up` : db *healthy*, front:8080 rend le plateau, `/api` en même origine, stockage `postgres`.
- [ ] Aucune donnée réelle ni secret dans les images ni le dépôt (fixtures seulement).
- [ ] Volume `db-data` (PostgreSQL) persistant + sauvegardé côté plateforme.
- [ ] Canal de livraison / registre confirmé (§7).
