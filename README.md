# Portefeuille Kanban — instrument de pilotage

Tableau kanban de portefeuille sur un seul écran : flux tiré, âge visible,
blocages criants, journal d'événements en source de vérité. Déployé sur la
plateforme conteneurisée on-premise du client (front React 18, middle Express,
back PostgreSQL — ADR 011) ; zéro egress applicatif.

C'est un **instrument, pas une plateforme**. Les comportements (vieillissement,
pulsation des bloqués, andon, un écran sans défilement) sont câblés en dur.
Seule la **topologie** est configurable : `config/board.json` (canaux,
colonnes, domaines, seuils), versionné dans git. Il n'y a pas d'interface de
réglages.

Architecture en couches et historique : voir `docs/ARCHITECTURE.md` (journal
vivant) et `docs/adr/` (décisions). Le contrat de travail est `CLAUDE.md`.

## Fonctionnalités

- Trois modes d'affichage commutables au clavier : **Normal** (`1`, cartes
  complètes), **Radiateur** (`2`, barres fines — tout le portefeuille d'un
  coup), **Focus** (`3` ou clic, une cellule canal×colonne agrandie).
- Vieillissement : le fond des cartes fonce par paliers (`agingStepsDays`),
  dérivé du journal. Bloqué : bordure rouge pulsante + raison ; au-delà de
  `andonThresholdDays`, marqueur d'escalade (▲). Repli d'un canal en synthèse.
- Panneau latéral (`S`) : recherche (`/`), codes projet, filtres type /
  nature / criticité / domaine / responsable / bloqués / âge. Les filtres
  **estompent**, ne retirent jamais (ADR 005). Compteurs et stats en direct.
- Cartes : criticité (★ Top, pip Major), type, code projet masquable, barre
  budget. **Clic en deux temps** : focus puis fiche détaillée (historique tiré
  du journal, signalement/levée de blocage, édition par événement `edited`).
- Navigation clavier : flèches déplacent la sélection ; `Ctrl`+flèches
  déplacent la carte. `Échap` déroule métriques → fiche → focus → panneau.
- **Métriques de flux** (`M`, ADR 007) : flux/temps par étape, composition
  d'âge, blocages, charge par canal, goulot — calculés exclusivement depuis
  le journal d'événements.
- Source des données : adaptateur `fixtures` (≈113 sujets synthétiques
  déterministes) derrière le port `PortfolioDataSource`. csv-import / sciforma
  à venir (RP4).
- Persistance : le middle écrit chaque action dans le journal append-only
  `card_events` via le port `BoardStorage` (pilote **JSONL** ; **PostgreSQL**
  via `pg` à venir, ADR 011). L'état (position, blocage, âge) est replié à la
  lecture, jamais stocké (ADR 002). Le serveur fait autorité sur
  id/horodatage/acteur.
- Critère d'acceptation : à 1920×1080 avec 100+ cartes, tout le tableau est
  visible sans défilement en mode radiateur — vérifié par un test.

## Démarrer (développement)

Node 22 (voir `.nvmrc` ; le dev fonctionne aussi sur Node 24.x, la cible de
déploiement est Node 22). Monorepo npm workspaces : `core/` (partagé, sans
dépendance), `middle/` (API Express), `front/` (React 18 + Vite).

**Le plus simple** — une seule commande peuple les fixtures (si besoin), lance
le middle **et** le front, puis ouvre le navigateur ; `Ctrl+C` arrête tout :

```bash
npm ci       # une fois
npm start    # → ouvre http://127.0.0.1:5173
```

> **Windows / PowerShell** : si `npm` est bloqué (« running scripts is disabled…
> npm.ps1 »), lancer directement `node scripts/dev.ts`, **ou** autoriser les
> scripts une fois : `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
> En `cmd.exe` ou Git Bash, `npm start` fonctionne tel quel.

À la main (deux terminaux, pratique en développement) :

```bash
# 1. Peupler le stockage de dev depuis les fixtures (une fois). Garde-fou
#    explicite : un `npm run seed` nu refuse (jamais sur la machine cliente).
KANBAN_ALLOW_SEED=1 npm run seed     # écrit data/board.jsonl (~113 cartes)

# 2. Terminal A — l'API (middle Express, :8787, pilote JSONL) :
npm run serve

# 3. Terminal B — le front (Vite, :5173, proxie /api → :8787) :
npm run dev
```

Ouvrir http://127.0.0.1:5173. Build de production du front : `npm run build`
(→ `front/dist/`).

Configuration du middle (variables d'environnement, défauts entre
parenthèses) : `KANBAN_HOST` (127.0.0.1), `KANBAN_PORT` (8787),
`KANBAN_STORAGE_DRIVER` (jsonl), `KANBAN_DATA_PATH` (data/board.jsonl),
`KANBAN_CONFIG_PATH` (config/board.json). **`seed` et `serve` doivent partager
le même `KANBAN_DATA_PATH`**, sinon le tableau est vide.

### Tableau vide ? (dépannage)

- Le middle ne tourne pas sur :8787 → lancer `npm run serve`.
- Le stockage n'est pas peuplé → `KANBAN_ALLOW_SEED=1 npm run seed`.
- Page blanche sur le serveur Vite **dev** après un changement de lockfile :
  boucle de rechargement HMR, pas un bug du code. Redémarrer `npm run dev` ;
  pour un contrôle de bout en bout stable, `npm run build` puis
  `npm run preview` (:4173) avec le middle lancé.

## Vérifier

```bash
bash verify.sh
```

Portail local avant conteneurisation, dans l'ordre : install (`npm ci`),
conventions, typecheck (core + middle + front), tests (`node:test`, dont le
test de frontières d'architecture `scripts/architecture.test.ts`), build du
front, SBOM (CycloneDX, `sbom.json`). La livraison vers la plateforme du
client se fait par **image conteneur** (ADR 011), non plus par installation
hors-ligne.

## Disposition du dépôt

```
core/        logique métier, TS pur, sans React ni APIs Node (workspace partagé)
adapters/    fixtures (csv-import, sciforma, planisware à venir)
middle/      API Express + TS, derrière le port BoardStorage
front/       application React 18 + Vite (couche de vue mince sur core/)
sync/        (RP4) processus CLI de synchronisation
config/      board.json (topologie versionnée)
fixtures/    jeux de données synthétiques
docker/      Dockerfiles + compose (Postgres de dev) — finalisés au RP6
docs/adr/    décisions d'architecture (français)
docs/ARCHITECTURE.md  journal vivant des changements d'architecture
design/      maquette de référence (prototype Sprint 0)
```

## Documents

- `CLAUDE.md` — le contrat de travail du projet.
- `docs/ARCHITECTURE.md` — journal des changements d'architecture.
- `docs/adr/` — une décision par fichier (001-011).
- `SECURITY.md` — posture de sécurité.
- `DEPENDENCIES.md` — gouvernance des dépendances (plafond SBOM).
