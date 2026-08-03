# sync/ — RP4

Processus CLI séparé, jamais intégré au middle web. À terme : tire depuis
l'adaptateur actif (csv-import, puis sciforma en lecture seule), écrit dans
PostgreSQL via le port `BoardStorage`, se termine. Identifiants dans un
fichier hors dépôt, référencé par chemin.

## Import CSV (implémenté) — audit puis chargement

`import.ts` : lit un dossier d'exports CSV, exécute la passe d'audit de
`adapters/csv-import/` (reconnaissance par contrat d'en-têtes, jamais par nom
de fichier), écrit le rapport Markdown français. **Rien n'est chargé** sans
le drapeau explicite `--charger` (docs/IMPORT-MAPPING.md).

```
npm run import -- <dossier> [--out <chemin-du-rapport>] [--charger]
```

Essai sur l'échantillon synthétique :
`npm run import -- fixtures/import --out data/rapport-import.md`

Fichiers reconnus : le **consolidé** (source unique des cartes et du
périmètre), l'export **projet** brut (chef de projet), la table **RDOM**
(domaines, exclusion des RDOM), **Ressources_PdC** (plan de charge 2026) et
**SP_total** (comblement des trous, optionnel).

Avec `--charger` : les cartes et leurs évènements sont écrits via
`BoardStorage.importCards`. Âge des cartes = date de début du projet ;
ré-import = mise à jour de l'existant + ajout des nouvelles ; l'export gagne
sur les faits, le tableau garde la position des cartes déplacées à la main
(divergences signalées).

Codes de sortie : 0 = audit produit (même avec douteux), 1 = exécution
impossible (arguments, dossier, config, stockage). La config du board est lue
via le magasin d'exécution (`getRuntime`) : un override admin appliqué sur la
plateforme est respecté.
