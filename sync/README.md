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
npm run import -- <dossier> [--out <chemin-du-rapport>] [--charger | --comparer] [--exercice <année>] [--domaines garder|remplacer]
```

- sans drapeau : audit seul, rien n'est lu du tableau ni écrit ; la
  console imprime les fichiers pris et le périmètre (ADR 055) ;
- `--comparer` : lit le tableau pour montrer ce qu'un chargement
  changerait (entrées, sorties, valeurs actualisées, faits gardés…), sans
  rien écrire ;
- `--charger` : écrit ; `--charger` et `--comparer` s'excluent ;
- `--exercice` : l'exercice lu et chargé (ADR 035 ; par défaut l'exercice
  courant de la config) ;
- `--domaines` : tranche pareil tous les conflits de domaine (ADR 036) ;
  sans lui, un chargement qui en rencontre est refusé — l'outil les
  tranche un par un.

Le chargement est **refusé** (message en français, code de sortie 1)
sur un exercice clos, sur des fichiers bloquants (ADR 056 : deux fichiers
d'une même sorte, un même nom reçu deux fois, un fichier qui ressemble à
l'export Coût sans être reconnu), sans périmètre, ou sans aucun projet
retenu sur l'exercice — la même règle que l'outil
(`adapters/csv-import/load-refusal.ts`). À l'audit, le refus est
annoncé et `--comparer` ne compare rien.

Essai sur l'échantillon synthétique :
`npm run import -- fixtures/import --out data/rapport-import.md`

Fichiers reconnus (révision 2026-09-04) : **Projets** (le périmètre —
onglet consolidé ou export brut), **PARAM** (responsables de domaine,
chemins d'organisation → domaine / sous-domaine), **ProjetsJalons**
(position initiale), **SP** (coûts 2026 ; `SP_2026` ou `SP_total`),
**Ressources_PdC** (plan de charge 2026). Un `RDOM.csv` de juillet est
inventorié « contrat retiré » et n'est pas lu. Depuis : **Coût** (COUT PREV,
le périmètre quand il est là — ADR 030), **ProjetsCdP** (chefs de projet),
**Ress.Profils** (ADR 024). **Un fichier par sorte** (ADR 056) : deux
fichiers reconnus pour un même contrat ne sont pas départagés, le
chargement est refusé ; seul couple admis, l'onglet Projets sans
« Responsable 1 » et l'export complet qui en porte.

Avec `--charger` : les cartes et leurs évènements sont écrits via
`BoardStorage.importCards`. Âge des cartes = date de début du projet (jamais
après le chargement) ; ré-import = mise à jour de l'existant + ajout des
nouvelles ; recharger les mêmes fichiers n'écrit rien (ADR 058). Un fait
que les fichiers laissent vide garde la valeur du tableau (ADR 054). Une
valeur **nouvelle** de l'export (différente de ce que l'import précédent
avait écrit) remplace une correction faite à la main ; une valeur répétée
la laisse (ADR 060). Position : une carte déplacée à la main vers une
autre colonne est déplacée par un jalon **nouveau et plus avancé** dans le
flux ; un jalon répété ou en retrait la laisse, et la divergence est dite
(ADR 060). Une carte supprimée au tableau n'est pas recréée ; une carte
créée à la main qui porte le code d'un projet de l'export est adoptée
(ADR 058/059).

Codes de sortie : 0 = audit produit (même avec douteux), 1 = exécution
impossible (arguments, dossier, config, stockage) ou chargement refusé. La
config du board est celle que sert l'outil (`getRuntime` : un override admin
appliqué sur la plateforme est respecté), mais les libellés de l'export se
reconnaissent sur le vocabulaire du modèle versionné `config/board.json`
(`importConfig`, ADR 056) : un renommage dans ⚙ ne change pas le périmètre.

## Clôture d'exercice (sync/cloture.ts) — ADR 026

```
node sync/cloture.ts                              # simulation : liste les sujets à archiver
node sync/cloture.ts --appliquer                  # archive les sujets des étapes terminales
node sync/cloture.ts --appliquer --annee 2027     # … et passe la config à l'exercice 2027
node sync/cloture.ts --colonnes done              # restreint aux colonnes données
```

Les sujets archivés le sont par des évènements `archived` (acteur
`cloture-<année>`), réversibles depuis la vue Archives. Étape suivante :
importer les fichiers du nouvel exercice — les sujets absents de cet import
sont marqués `unlisted` (jamais supprimés), `relisted` à leur retour.

## Import depuis l'outil (ADR 027)

⚙ › Importer (ADR 049 ; le bouton ⬆ de l'en-tête avant) fait la même chose
que `node sync/import.ts` (audit puis `--charger`), avec le même rapport
lisible (ADR 055) et la même règle de refus, sans terminal ni réglage.
Dans l'outil, un chargement passe dans la file des écritures du tableau
(ADR 058) ; le CLI, processus séparé, n'y passe pas : ne pas lancer
`--charger` pendant un chargement depuis l'outil.
