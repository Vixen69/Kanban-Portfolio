# Portefeuille Kanban — instrument de pilotage

Tableau kanban de portefeuille sur un seul écran : flux tiré, âge visible,
blocages criants, journal d'événements en source de vérité. Déployé sur la
plateforme conteneurisée on-premise du client (front React 18, middle Express,
back PostgreSQL — ADR 011) ; zéro egress applicatif.

C'est un **instrument, pas une plateforme**. Les comportements (âge visible,
pulsation des bloqués, flux tiré, un écran sans défilement) sont câblés en
dur. Seule la **topologie** est configurable : `config/board.json` (canaux,
colonnes, WIP, gates, domaines, types, seuils) est le modèle par défaut
versionné dans git ; un panneau d'administration (⚙, réservé à l'admin)
peut appliquer une surcharge à chaud, historisée en append-only (ADR 013).

Architecture en couches et historique : voir `docs/ARCHITECTURE.md` (journal
vivant) et `docs/adr/` (décisions). Le contrat de travail est `CLAUDE.md`.

## Fonctionnalités (design v11, ADR 017/018/019)

- **Radiateur par défaut** : barres fines (~16 px), tout le portefeuille d'un
  coup. **Un clic sur une carte ouvre sa fiche** ; cliquer une colonne
  **focalise ce stade** (cartes étendues). Canaux repliables en ligne de
  synthèse ; colonnes repliables en bandeau (« Pause » démarre repliée). Gates
  **DoR/DoD** en badge + liseré sur leurs colonnes. Déposer une carte **sur une
  autre** l'insère juste avant (ordre manuel, ADR 019).
- Âge porté par la **pastille texte** (3j/2s/4m ; orange dès « récent »
  dépassé, rouge dès « vieillit » dépassé — seuils 7/28/60 en config).
  Bloqué : **lavis rouge** sur la carte (un seul signal) + raison ; le point
  pulsant ne subsiste que dans le bandeau BLOCAGE de la fiche ; badge de
  comptage des bloqués par cellule. WIP : n/limite, avertit à ≥ 80 %, rougit
  au-delà de 100 % — signale, ne bloque jamais.
- Panneau latéral (`S`) : recherche titre + code projet (`/`), interrupteur
  codes projet, interrupteur **« Bloqués uniquement »**, filtres type /
  criticité / domaine avec tout·rien (pas de filtre nature — la nature est le
  canal, ADR 018). Les filtres **estompent**, ne retirent jamais (ADR 005).
  Compteurs affichés/total et stats en direct ; état vide avec réinitialisation.
- Fiche détaillée (design v11, ADR 017/018/019) : **budget · graphe croisé**
  (enveloppe RDLI / estimé / engagé / réalisé) **avant** le **plan de charge
  par profil DSI** (j.h répartis, consommé éditable par profil), **risque de
  contention** (profils en tension + note), **risques & alertes** (alertes
  dérivées + risques typés éditables + alertes libres), **contraintes du
  projet**, **date RDR** (livraison projetée) — tous éditables en ligne. Plus :
  commentaires (`commented`), section **BLOCAGE** à motif obligatoire
  (« Lever »), **Délais** (âges par étape + lead/cycle) et **Historique**
  (repliables, incl. blocage/déblocage), édition complète (`edited`, sans
  sélecteur nature ni bascule Bloqué), **archivage** (`archived`/`unarchived`),
  suppression (`deleted` — le journal garde tout). **« + Sujet »** (`N`) :
  création locale, entre toujours dans la première colonne (flux tiré). Vue
  **Archives** (icône + badge) : liste cherchable, « Désarchiver », ouverture
  de la fiche (ADR 017).
- **Panneau d'administration** (⚙) : topologie/vocabulaire uniquement —
  colonnes (ordre, WIP, gate), canaux, domaines, types, libellés natures/
  criticités, champs de carte personnalisés. Surcharge persistée côté
  middle avec historique append-only ; « Réinitialiser le modèle » revient
  à `config/board.json` (ADR 013).
- **Métriques de flux** (☷, ADR 007) : flux/temps par étape, composition
  d'âge, blocages, charge par canal, goulot — calculés exclusivement depuis
  cartes + journal d'événements.
- Source des données : adaptateur `fixtures` (150 sujets synthétiques
  déterministes, seed 20260609) derrière le port `PortfolioDataSource`.
  csv-import / sciforma à venir (RP4).
- Persistance : le middle écrit chaque action dans le journal append-only
  `card_events` via le port `BoardStorage`. Back end de livraison :
  **PostgreSQL** (`pg`, ADR 016 — défaut en conteneur) ; pilote **JSONL**
  sélectionnable en repli mono-instance. L'état (position, blocage, âge) est
  replié à la lecture, jamais stocké (ADR 002). Le serveur fait autorité sur
  id/horodatage/acteur.
- Critère d'acceptation : à 1920×1080 avec 100+ cartes, tout le tableau est
  visible sans défilement en mode radiateur — vérifié par un test.

## Démarrer (développement)

Node 22 (voir `.nvmrc` ; le dev fonctionne aussi sur Node 24.x, la cible de
déploiement est Node 22). Monorepo npm workspaces : `core/` (partagé, sans
dépendance), `middle/` (API Express), `front/` (React 18 + Vite).

**Le plus simple (sans terminal)** — double-cliquer **`Lancer le
tableau.cmd`** à la racine du dépôt : il installe les dépendances si besoin,
peuple les fixtures, lance l'API et le front, puis ouvre le navigateur.
Fermer la fenêtre (ou `Ctrl+C`) arrête tout.

En ligne de commande, l'équivalent :

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
KANBAN_ALLOW_SEED=1 npm run seed     # écrit data/board.jsonl (150 cartes)

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
client se fait par **image conteneur** (ADR 011/015), non plus par
installation hors-ligne.

## Livrer (conteneurs)

Deux images — **front** (nginx, statique + proxy `/api`) et **middle**
(Express, **PostgreSQL** par défaut, JSONL en repli) — construites depuis ce
dépôt, même origine, zéro egress, dans le plafond SBOM. Conteneurs durcis :
en-têtes de sécurité sur la page (nginx) comme sur l'API (Express), middle en
utilisateur non-root, images de base épinglées par digest, ports publiés liés à
la loopback. Le dossier de remise **[`LIVRAISON.md`](LIVRAISON.md)** détaille :
construire, lancer, config/env, le SBOM, le point restant à trancher avec le
référent (canal de livraison), la checklist, et un **runbook de test local
Docker** (`docker compose -f docker/compose.yaml --profile app up --build`).

## Disposition du dépôt

```
core/        logique métier, TS pur, sans React ni APIs Node (workspace partagé)
adapters/    fixtures (csv-import, sciforma, planisware à venir)
middle/      API Express + TS, derrière le port BoardStorage
front/       application React 18 + Vite (couche de vue mince sur core/)
sync/        (RP4) processus CLI de synchronisation
config/      board.json (topologie versionnée)
fixtures/    jeux de données synthétiques
docker/      Dockerfiles (front nginx, middle Express) + compose — ADR 015
docs/adr/    décisions d'architecture (français)
docs/ARCHITECTURE.md  journal vivant des changements d'architecture
design/      maquette validée v11 (référence produit, ADR 012-019)
```

## Documents

- `CLAUDE.md` — le contrat de travail du projet.
- `LIVRAISON.md` — dossier de remise conteneurisée (construire / livrer / tester).
- `docs/ARCHITECTURE.md` — journal des changements d'architecture.
- `docs/adr/` — une décision par fichier (001-019).
- `SECURITY.md` — posture de sécurité.
- `DEPENDENCIES.md` — gouvernance des dépendances (plafond SBOM).
