# Livraison — Portefeuille DSI · Kanban NMO

Dossier de remise à l'équipe plateforme du client. L'outil est **développé en
externe** (machine de l'auteur) puis **livré conteneurisé**, dans le **plafond
SBOM** autorisé. Ce document décrit ce qui est livré, comment le construire, le
lancer, le vérifier, et les deux points à trancher avec le référent technique.

> **En une phrase** : deux images de conteneur (un front nginx statique, un
> middle Express) construites depuis ce dépôt, servies en **même origine**
> (le front proxifie `/api` vers le middle), **zéro egress**, dépendances
> **dans le plafond SBOM**, avec un **SBOM CycloneDX** livré à côté.

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

> ⚠️ La construction n'a **pas** pu être exécutée dans l'environnement de
> l'auteur (pas de Docker). Chaque étape a été **prouvée par sa commande
> équivalente sur l'hôte** (build front → `front/dist` ; `node middle/main.ts`
> → l'API sert 150 cartes ; `node scripts/sbom.ts` → CycloneDX). Le premier
> `docker build` doit être lancé et vérifié sur une machine avec Docker
> (section 8).

## 4. Lancer

```bash
docker compose -f docker/compose.yaml --profile app up
```

- **Front** : http://localhost:8080 (nginx). Tout appel `/api/*` est proxifié
  vers le middle en même origine.
- **Middle** : http://localhost:8787 (Express). Stockage **JSONL** sur le
  volume `/data`.

### Configuration (variables d'environnement du middle, `middle/config.ts`)

| Variable | Défaut | Rôle |
|---|---|---|
| `KANBAN_HOST` | `0.0.0.0` (image) | Interface d'écoute |
| `KANBAN_PORT` | `8787` | Port |
| `KANBAN_STORAGE_DRIVER` | `jsonl` | Pilote de stockage (seul `jsonl` actif) |
| `KANBAN_DATA_PATH` | `/data/board.jsonl` | Fichier de données (sur volume) |
| `KANBAN_CONFIG_PATH` | `config/board.json` | Topologie par défaut (dans l'image) |

**Secrets** : aucun n'est dans l'image (CLAUDE.md §6). Les identifiants (DB,
sync) arriveront par fichier/secret monté hors dépôt, référencés par chemin.

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
  (middle) + **react/react-dom** *bundlés* (front, aucun node_modules livré
  côté front). Le reste du plafond (cors, cookie-parser, jsonwebtoken, dotenv,
  design-system front…) est **autorisé mais pas encore installé** (auth = RP3).

## 6. Stockage : JSONL aujourd'hui, PostgreSQL ensuite

Le middle tourne sur un pilote **JSONL** (fichier append-only, lisible) derrière
le port `BoardStorage`. **PostgreSQL est la cible** (`config/` §4) via **`pg`**,
mais `pg` est **hors plafond SBOM** et le pilote `postgres` **lève une erreur**
tant qu'il n'est pas autorisé (`middle/storage/select.ts`). Le service `db`
(profil `postgres`) du compose est **infra seule**, non utilisé par l'app.

Bascule le jour où `pg` est autorisé : un seul fichier isolé derrière le port
`BoardStorage`, sans recâblage (ADR 011).

## 7. À trancher avec le référent technique (deux points)

1. **Autoriser `pg` (node-postgres)** — seule dépendance runtime hors du SBOM
   de référence. Sans elle : JSONL, pas PostgreSQL.
2. **Le canal de livraison / registre d'images** dans la plateforme (push
   registre, tarball d'image, Git interne) — encore non fixé.

Aucun autre écart au plafond. Tout le reste est dans les versions autorisées.

## 8. Tester en local avec Docker (avant d'en parler au client)

Runbook pas-à-pas, depuis la **racine du dépôt** sur ta machine (Windows).
Objectif : construire, lancer et voir les 150 cartes + la fiche v10.

**a. Installer Docker Desktop** (si absent) et le démarrer. Vérifier :
```bash
docker --version && docker compose version
```

**b. Semer des données de test** dans le dossier monté par le middle
(`docker/data/`). Fixtures = uniquement pour ce test local ; en production le
client peuple le volume par import/sync.

PowerShell :
```powershell
$env:KANBAN_ALLOW_SEED="1"; $env:KANBAN_DATA_PATH="docker/data/board.jsonl"; npm run seed
```
Bash :
```bash
KANBAN_ALLOW_SEED=1 KANBAN_DATA_PATH=docker/data/board.jsonl npm run seed
```
Attendu : `seed: 150 cartes, 768 évènements importés.`

**c. Générer le SBOM** (livré à côté des images) :
```bash
npm run sbom
```

**d. Construire et lancer** :
```bash
docker compose -f docker/compose.yaml --profile app up --build
```
Laisser tourner (logs des deux conteneurs). Le middle affiche
`kanban middle: http://0.0.0.0:8787 (jsonl)`.

**e. Vérifier dans le navigateur** : ouvrir **http://localhost:8080**
- Le plateau affiche **150 cartes**, sans défilement.
- Cliquer une colonne pour la focaliser, puis une carte → la **fiche détail**
  montre les sections v10 : *plan de charge par profil*, *risque de contention*,
  *budget · graphe croisé (RDLI)*, *risques & alertes*.
- Éditer un champ en ligne (ex. une alerte) → il persiste après rechargement
  (round-trip par évènement, écrit dans `docker/data/board.jsonl`).

Contrôle API direct (optionnel) :
```bash
curl -s http://localhost:8787/api/board | node -e "process.stdin.once('data',d=>{const b=JSON.parse(d);console.log('cartes',b.cards.length,'évts',b.events.length)})"
```

**f. Arrêter / nettoyer** :
```bash
docker compose -f docker/compose.yaml --profile app down
```
Les données de test restent dans `docker/data/` (ignoré par git). Pour repartir
de zéro : supprimer `docker/data/board.jsonl`.

### Si ça coince
- **Page blanche / erreurs `/api`** : le proxy front ne joint pas le middle —
  vérifier que le service `middle` tourne (`docker compose … ps`) et que
  `MIDDLE_HOST`/`MIDDLE_PORT` pointent dessus.
- **Plateau vide** : le volume `docker/data/board.jsonl` n'a pas été semé (b) —
  le middle sert alors un plateau vide (aucune erreur).
- **`npm ci` échoue dans l'image** : vérifier que `package-lock.json` est à
  jour (`npm ci` en local passe) — c'est la même commande.

## 9. Checklist de livraison

- [ ] `bash verify.sh` vert (lint conventions, typecheck ×3, tests, build front, SBOM).
- [ ] `npm run sbom` régénéré ; `sbom.json` joint à la livraison.
- [ ] `docker compose --profile app build` réussit sur une machine Docker.
- [ ] `--profile app up` : front:8080 rend le plateau, `/api` répond en même origine.
- [ ] Aucune donnée réelle ni secret dans les images ni le dépôt (fixtures seulement).
- [ ] Canal de livraison / registre confirmé (§7-2).
- [ ] `pg` : statut d'autorisation noté (§7-1) — livraison JSONL sinon.
