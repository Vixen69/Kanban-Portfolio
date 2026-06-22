# ADR 008 — Port de stockage et pilote node:sqlite

## Contexte

Le Sprint 3 persiste les cartes et le journal `card_events`. La VM cliente
reste inconnue (version Node exacte, outillage de compilation, miroir npm —
CLAUDE.md §12) ; le choix du moteur doit donc être **réversible à coût
faible**. Faits établis (recherche, juin 2026) :

- `node:sqlite` : intégré à Node, sans drapeau depuis 22.13/23.4 ; passé
  « release candidate » (API gelée, recommandée en production) en **24.15.0
  LTS**. Absent de Node 20 (EOL), expérimental sur la ligne 22.
- `better-sqlite3` : le tarball npm ne contient **aucun binaire** ; à
  l'installation, `prebuild-install` télécharge le binaire (égress interdit
  côté client) ou `node-gyp` recompile (toolchain C++ + Python + en-têtes
  Node requis sur la VM). Les binaires sont liés à l'ABI Node
  (v115/v127/v137) : ils cassent d'une version majeure à l'autre et
  rompent le rituel sha256 du passage entre machines.

## Décision

- Un port **`BoardStorage`** dans `core/ports.ts`, au **niveau dépôt**
  (importCards, appendEvent, listEvents, listBaseCards, close), jamais au
  niveau SQL — pour qu'un pilote non-SQL reste possible (repli JSONL,
  ADR 009 à venir).
- Pilote retenu : **`node:sqlite`** (`server/storage/sqlite.ts`). Prérequis
  de déploiement : **Node 24 LTS ≥ 24.15** (`engines` dans package.json).
  Zéro dépendance runtime.
- La table `cards` stocke **l'instantané importé** ; l'état courant est
  replié à la lecture (ADR 002), jamais stocké.
- Ordre des événements : colonne entière `seq` (clé primaire), id dérivé
  `evt-<seq>` — le départage de `foldEvents` (suffixe numérique de l'id)
  fonctionne sans modifier `core/`.
- L'append-only est défendu **dans le schéma** : TRIGGERs
  `BEFORE UPDATE/DELETE → RAISE(ABORT)`, tables STRICT, contraintes CHECK
  (types d'événements, `json_valid` sur les payloads). Portée exacte : ces
  garde-fous bloquent la réécriture par la **surface SQL applicative** et
  une injection limitée à un ordre DML — ils ne sont **pas** inviolables
  face à un processus disposant d'un accès en écriture au fichier (un
  `DROP TRIGGER`, ou un `INSERT` rétro-daté, restent possibles). La
  frontière réelle de l'intégrité est donc le **système de fichiers** :
  permissions restrictives et moindre privilège (seul le processus `sync`
  du Sprint 5 écrit). Une **preuve d'inviolabilité** par chaînage de
  hachés (`hash(prev || ligne)`) rendrait toute altération *détectable* à
  l'audit ; elle est notée comme évolution possible, hors périmètre S3.1.
- `PRAGMA journal_mode=WAL` + `busy_timeout` dès l'ouverture (lecteur
  serveur + écrivain sync du Sprint 5). Migrations ordonnées via
  `PRAGMA user_version`, chacune transactionnelle.
- Sélection de pilote **explicite** dans la configuration serveur
  (`server/storage/select.ts`) ; jamais d'auto-détection ni de repli
  silencieux.
- Le stockage n'attribue que l'id/seq ; horodatage, acteur et validation
  topologique appartiennent à l'appelant (serveur HTTP, ADR à venir).

## Conséquences

- SBOM inchangé, budget runtime **0/1** consommé ; les garde-fous
  append-only (triggers, STRICT, CHECK) sont inspectables dans le schéma
  du fichier de base par l'officier sécurité, en gardant à l'esprit leur
  portée (ci-dessus).
- `CLAUDE.md §4` est **amendé dans la même livraison** (précédent ADR 006) :
  la table `cards` documente `criticality`, `type_id`, `codename` ; la
  table `card_events` documente la colonne `seq` ; les champs de position
  et de blocage de `cards` sont l'**instantané d'import**, l'état courant
  étant replié à la lecture (ADR 002).
- `node:sqlite` émet un `ExperimentalWarning` sur stderr tant que sa
  stabilité n'est pas « 2 » ; c'est cosmétique — `verify.sh` ne juge que
  les codes de sortie, pas stderr.
- Si la VM impose Node 22 : un pilote `better-sqlite3` = un fichier
  implémentant ce port + une ligne de config + un ADR (binaire prebuild
  v127 véhiculé hors npm, jamais téléchargé à l'installation).
- Une **suite de conformité unique** (`conformance.test.ts`) s'exécute
  contre chaque pilote : la réversibilité est testée, pas déclarée.
- Machine de développement < 24.15 : avertissement `engines` non bloquant
  à l'installation ; à aligner sur 24.15+.
