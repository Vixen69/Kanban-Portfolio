# sync/ — RP4

Processus CLI séparé, jamais intégré au middle web. À terme : tire depuis
l'adaptateur actif (csv-import, puis sciforma en lecture seule), écrit dans
PostgreSQL via le port `BoardStorage`, se termine. Identifiants dans un
fichier hors dépôt, référencé par chemin.

## Étape 1 (implémentée) — import CSV en mode audit

`import.ts` : lit un dossier d'exports CSV, exécute la passe d'audit de
`adapters/csv-import/` (reconnaissance par contrat d'en-têtes, jamais par nom
de fichier), écrit le rapport Markdown français. **Rien n'est chargé** tant
que le rapport n'est pas propre (docs/IMPORT-MAPPING.md).

```
npm run import -- <dossier> [--out <chemin-du-rapport>]
```

Essai sur l'échantillon synthétique :
`npm run import -- fixtures/import --out data/rapport-import.md`

Codes de sortie : 0 = audit produit (même avec douteux), 1 = exécution
impossible (arguments, dossier, config). La config du board est lue via le
magasin d'exécution (`getRuntime`) : un override admin appliqué sur la
plateforme est respecté.
