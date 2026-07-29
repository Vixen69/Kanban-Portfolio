# ADR 021 — Parseur d'import CSV, étape 1 : harnais et table RDOM en mode audit

## Contexte

- Le RP4 démarre : brancher le portefeuille réel via les exports PPM. Le
  contrat complet du parseur est consigné dans `docs/IMPORT-MAPPING.md`
  (sources `RDOM` / `SP_total` / `projet` / `ressources_PDC`, règles de
  dérivation, rapport d'import, pièges anticipés).
- Décisions d'auteur du 2026-07-29 : entrée en **CSV** (Q13 — aucune
  bibliothèque `.xlsx`, donc rien à faire valider au plafond SBOM) ;
  **construction par étapes** avec un rapport à chaque passage ; la table
  `RDOM` (domaine ↔ nom) remplace `CORRESP` et sert deux usages (domaine via
  le responsable de portefeuille, exclusion des RDOM du chef de projet).
- Contraintes permanentes : aucune donnée client réelle sur la machine de
  l'auteur (squelettes synthétiques seulement) ; **mode audit d'abord** —
  la première version ne charge rien, elle ne produit que le rapport.

## Décision

- **Modules purs sous `adapters/csv-import/`** (aucun accès disque, aucune
  dépendance) : décodage (`decode.ts` — UTF-8 attendu, BOM toléré,
  Windows-1252 détecté et signalé, UTF-16 refusé), lecteur CSV artisanal
  (`csv.ts` — `;` attendu, `,` détecté et signalé, guillemets/échappements,
  lignes comptées), **reconnaissance par contrat d'en-têtes, jamais par nom
  de fichier** (`contract.ts` — match tolérant casse/accents/ordre, écarts
  nommés précisément, near-miss jamais parsé), modèle de rapport partagé
  (`report.ts` : inventaire + pris/écarté/douteux + signalements), rendu
  Markdown français (`render-report.ts`), lecteur `RDOM` (`rdom.ts`) et
  passe d'assemblage (`orchestrate.ts`), le tout déterministe.
- **CLI mince `sync/import.ts`** (`npm run import -- <dossier> [--out …]`) :
  lit le dossier, appelle la passe pure, écrit le rapport (écrasé à chaque
  exécution — aucun état caché). La config du board est lue via
  `createConfigStore(...).getRuntime()` : un override admin est respecté
  (contrairement à `scripts/seed.ts`, qui lit les défauts).
- Codes de sortie : 0 = audit produit (même avec douteux — le douteux EST le
  produit), 1 = exécution impossible (arguments, dossier, config invalide).
- La résolution des domaines de `RDOM` accepte id, nom ou code court
  (`ING`, `A&D`…), signale la forme utilisée, fusionne les doublons,
  questionne les noms présents sous deux domaines et avertit pour tout
  domaine du board sans RDOM.

## Conséquences

- Les étapes 2-4 sont **additives** : une entrée de registre de contrat +
  un fichier lecteur + leurs sections de rapport chacune ; le harnais
  (décodage, CSV, contrats, rapport) ne bouge plus.
- La `RdomTable` est la surface de jointure de l'étape 3 (domaine par
  responsable de portefeuille, exclusion du chef de projet).
- Le contrat d'en-têtes fait office de **vérification de structure sur
  site** : toute dérive des exports réels est nommée au premier passage,
  sans qu'aucun fichier client ne traverse vers la machine de l'auteur.
- Aucun changement de `core/`, du stockage ni du middle ; zéro dépendance
  ajoutée ; ~50 tests nouveaux (`adapters/csv-import/*.test.ts`), pipeline
  vert (390 tests, conventions, typecheck).
