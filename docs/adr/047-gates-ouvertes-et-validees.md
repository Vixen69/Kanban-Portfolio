# ADR 047 — Où la DoR et la DoD s'ouvrent, où elles sont validées ; Études/Cadrage et Terminé

Date : 2026-09-24 · Statut : accepté (décision de l'auteur, croquis du jour)

## Contexte

L'ADR 045 a posé les jalons du référentiel en tête de colonne, avec DoR
sous RDLI et DoD sous RDR. L'auteur affine : une gate de qualité ne
tombe pas du ciel à sa revue, elle s'instruit sur plusieurs étapes. La
DoR s'ouvre à la RDO et se valide à la RDLI ; la DoD s'ouvre à la RDLI
et se valide à la RDR. Le tableau doit montrer les deux moments. Au
passage, deux noms de colonnes changent : « Études » devient
« Études/Cadrage », « Done » devient « Terminé ».

## Décisions

1. **Un second champ de vocabulaire** sur la colonne : `gateStart`, la
   gate dont la liste de contrôle s'ouvre à l'entrée de la colonne (DoR,
   DoD ou null), à côté de `gate`, la gate validée à son entrée. Rien
   n'est vérifié par le logiciel (§1, ADR 013). Réglable dans le modèle
   versionné seulement (ADR 046).
2. **Le modèle versionné** : Qualification porte RDO et ouvre la DoR ;
   Prêts porte RDLI, valide la DoR et ouvre la DoD ; Actifs porte le
   Kick-off ; Terminé porte RDR et valide la DoD.
3. **L'écran** : sous le jalon, les badges côte à côte — la gate validée
   en trait plein avec « ✓ », la gate ouverte en pointillés, plus pâle.
   Infobulles : « DoR validée à l'entrée de Prêts », « DoD ouverte à
   Prêts — Definition of Done à instruire ». Côte à côte plutôt
   qu'empilés : la pile à trois étages de Prêts grandissait tous les
   en-têtes de 11 px ; la hauteur reste à 67 px. La ligne au bord des
   cellules ne marque que la gate validée, comme avant.
4. **Les noms** « Études/Cadrage » et « Terminé » sont repris par le
   rapport d'audit de l'import (répartition, position, carte placée
   dans Terminé par son état). Les identifiants de colonnes ne changent
   pas : aucune carte ne bouge, aucune ancre de flux non plus.

## Conséquences

- `core/config-types.ts` (`Column.gateStart`), `core/config.ts`,
  `config/board.json` ; tests `core/config-columns.test.ts` (sortis de
  `config.test.ts`, qui dépassait 300 lignes) ; `front/components/
  ColumnHeads.tsx` (`GateMark`), `Cell.tsx`, `DetailSections.tsx`,
  `board.css` ; `adapters/csv-import/assembly.ts`, `enrich.ts` et leurs
  tests.
- Le modèle versionné change : une configuration appliquée avant est
  écartée au redémarrage (ADR 038).
