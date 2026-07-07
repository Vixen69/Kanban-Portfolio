# ADR 015 — Conteneurisation et livraison (RP6)

## Contexte

Le client accepte un **développement externe** et une **transmission par tout
canal**, à condition que la livraison soit **conteneurisée** et **dans le
plafond SBOM** (CLAUDE.md §7). Le squelette `docker/` d'origine (RP0) était
pré-RP6 : `Dockerfile.middle` appelait un script `build` inexistant et attendait
un `middle/dist/` jamais produit ; `Dockerfile.front` ne proxifiait pas `/api` ;
pas de `.dockerignore` ; le compose provisionnait un PostgreSQL que le code
ignore. Il fallait rendre les images **réellement constructibles** et
documenter la remise.

## Décision

- **Deux images**, même origine, zéro egress :
  - **front** : build Vite (`npm run -w front build`) → statique servi par
    `nginx:1.27-alpine`, qui **proxifie `/api` vers le middle**
    (`docker/nginx.default.conf.template`, upstream `MIDDLE_HOST`/`MIDDLE_PORT`
    substitué au démarrage). Le navigateur ne parle qu'en même origine.
  - **middle** : `node:22.18-alpine`, **exécution directe du TypeScript**
    (`CMD node middle/main.ts`, *type stripping* Node 22.18) — **pas d'étape
    de compilation**, car le middle importe des spécificateurs `.ts` et son
    `tsconfig` est `noEmit` ; c'est déjà le modèle de `npm run serve`. L'image
    copie `core/ middle/ config/` et un `npm ci --omit=dev` reproductible.
- **Stockage** : **stockage fichier JSONL durable retenu pour la 1re mise en
  service** (choix auteur) — journal append-only sur un **volume persistant
  sauvegardé par la plateforme, middle mono-instance** ; **zéro dépendance hors
  plafond** (pas de `pg`). PostgreSQL reste la voie d'escalade (scaling
  horizontal / exigence SGBD) : un seul adaptateur derrière le port
  `BoardStorage`, et **là seulement** `pg` deviendrait à autoriser. Le service
  `db` du compose (profil `postgres`) est prêt pour ce jour-là, non requis
  aujourd'hui.
- **SBOM** : généré **dans la construction de l'image middle**
  (`node scripts/sbom.ts` → `/app/sbom.json`, CycloneDX) et régénérable à la
  racine (`npm run sbom`) pour livraison à côté des images.
- **`.dockerignore`** : contexte minimal et déterministe (pas de
  `node_modules`, `.git`, `data/`, `dist/` — l'image reconstruit `front/dist`).
- **Node épinglé** au plancher `engines` (`node:22.18-alpine`), pas au majeur
  seul.
- **Secrets** : aucun dans les images (env/fichiers montés hors dépôt).
- **Non vérifié en construction ici** (pas de Docker sur la machine d'auteur) :
  chaque étape est **prouvée par sa commande hôte équivalente** ; le premier
  `docker build` se fait sur une machine Docker (runbook : `LIVRAISON.md` §8).

## Conséquences

- La remise est décrite dans **`LIVRAISON.md`** (construire → SBOM → lancer →
  config → demandes au référent → checklist → test local Docker).
- **Deux points à confirmer avec le référent technique** : (1) un **volume
  durable + sauvegardé** pour le stockage fichier convient-il (middle
  mono-instance), ou PostgreSQL d'emblée (→ autoriser `pg`) ; (2) fixer le
  **canal de livraison / registre**. Avec le stockage fichier, aucun écart au
  plafond.
- Le middle image embarque `react` (dépendance runtime du workspace front,
  tirée par l'install workspace) sans l'exécuter — acceptable ; le SBOM le
  reflète honnêtement.
- CI d'image (build + scan SBOM automatisés dans le pipeline du client) reste
  à câbler côté plateforme — hors périmètre de ce dépôt.
