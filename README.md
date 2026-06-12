# Portefeuille Kanban — instrument de pilotage

Tableau kanban de portefeuille sur un seul écran : flux tiré, âge visible,
blocages criants, journal d'événements en source de vérité. Conçu pour un
déploiement souverain on-premise (zéro egress, zéro service externe).

C'est un **instrument, pas une plateforme**. Les comportements (vieillissement,
pulsation des bloqués, andon, un écran sans défilement) sont câblés en dur.
Seule la **topologie** est configurable : `config/board.json` (canaux,
colonnes, domaines, seuils), versionné dans git. Il n'y a pas d'interface de
réglages.

## État — Sprint 2 (panneau latéral, filtres, navigation clavier)

- Panneau latéral (`S` ou bouton ≡) : **recherche** (titre + code projet,
  touche `/`), interrupteur **Codes projet**, filtres **Type de projet**,
  **Nature**, **Criticité**, **Domaine** (pastilles, tout/rien,
  compteurs), **responsable**, **bloqués seulement**, **âge dans la
  colonne** (seuils issus de `agingStepsDays`).
- Les filtres **estompent** les cartes, ils ne les retirent jamais : la
  structure spatiale du tableau reste la vérité (ADR 005).
- Lecture en direct : « x / y affichés », statistiques sélection/total
  (total, bloqués, stagnants, criticités, natures), puce
  « Filtré : x/y ✕ » dans l'en-tête.
- Cartes : marqueur de criticité (★ Top, pip Major), étiquette de type,
  code projet masquable, barre budget consommé/estimé (cartes normales).
- **Clic en deux temps** (maquette P5) : premier clic → focus de la
  cellule ; second clic (ou `Entrée`) → fiche détaillée : étiquettes,
  responsable, âge, budget, dépendances, **historique tiré du journal
  d'événements**, signalement / levée de blocage (événements).
- Navigation clavier : flèches pour déplacer la **sélection** de carte
  (haut/bas dans la cellule, gauche/droite entre colonnes) ;
  `Ctrl`+flèches déplace toujours la carte elle-même. `Échap` déroule :
  métriques, puis fiche, puis focus, puis panneau.
- **Métriques de flux** (`M` ou ☷, Sprint 6 tiré en avant, ADR 007) :
  flux par étape, temps moyen par étape, composition d'âge, blocages,
  charge par canal, goulot principal — calculés exclusivement depuis le
  journal d'événements.
- **Édition de la fiche** (« Modifier ») : titre, responsable, domaine,
  criticité, type, code, tags, budget — un événement `edited` par
  enregistrement, appliqué par le repli avec liste blanche (ADR 007).
  Pas de panneau d'administration de la topologie : le contrat l'interdit
  (« no settings UI ») — la topologie s'édite dans `config/board.json`.

## État — Sprint 1 (tableau cœur)

- Chargement et validation de la configuration (`config/board.json`).
- Adaptateur `fixtures` derrière le port `PortfolioDataSource` : ~112 sujets
  synthétiques déterministes, avec historique d'événements rétro-daté.
- Trois modes d'affichage commutables au clavier :
  - **Normal** (`1`) : cartes complètes (titre, domaine, responsable, tags, âge) ;
  - **Radiateur** (`2`) : barres fines, tout le portefeuille visible d'un coup ;
  - **Focus** (`3` ou clic sur une cellule) : une cellule canal×colonne agrandie,
    le reste estompé. `Échap` pour revenir.
- Repli d'un canal en ligne de synthèse (clic sur l'étiquette du canal).
- Vieillissement : le fond des cartes fonce par paliers (`agingStepsDays`),
  calculé depuis le journal d'événements.
- Bloqué : bordure rouge pulsante, raison au survol ; au-delà de
  `andonThresholdDays`, marqueur statique d'escalade (▲).
- Déplacement : glisser-déposer natif **et** repli clavier
  (`Tab` pour sélectionner une carte, `Ctrl`+flèches pour la déplacer).
  Chaque déplacement écrit un événement (acteur + horodatage) dans le
  journal append-only en mémoire (persisté en SQLite au Sprint 3).
- Critère d'acceptation : à 1920×1080 avec 100+ cartes, tout le tableau est
  visible sans défilement en mode radiateur — vérifié par un test.

## Démarrer

```bash
# Node 24 LTS (voir .nvmrc)
npm ci
npm run dev        # serveur de développement Vite
npm run build      # build de production dans dist/
```

## Vérifier

```bash
bash verify.sh
```

Enchaîne dans l'ordre : install (`npm ci`, hors-ligne si `vendor/` est
peuplé), conventions, typecheck, tests (`node:test`), build, SBOM
(CycloneDX, `sbom.json`). Doit passer à l'identique sur la machine de
développement et sur la machine côté client.

## Disposition du dépôt

```
core/        logique métier, TS pur, sans React ni APIs Node
adapters/    fixtures (csv-import, sciforma, planisware à venir)
server/      (Sprint 3) API node:http + statique
sync/        (Sprint 5) processus CLI de synchronisation
ui/          application React (couche de vue mince sur core/)
config/      board.json (topologie versionnée)
fixtures/    jeux de données synthétiques
docs/adr/    décisions d'architecture (français)
design/      maquette de référence (prototype Sprint 0)
vendor/      tarballs vendorisés pour l'installation hors-ligne
```

## Documents

- `SECURITY.md` — posture de sécurité.
- `DEPENDENCIES.md` — budget et justification des dépendances.
- `docs/adr/` — une décision par fichier.
- `CLAUDE.md` — le contrat de travail du projet.
