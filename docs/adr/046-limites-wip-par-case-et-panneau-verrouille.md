# ADR 046 — Limites WIP par case, et un panneau de configuration verrouillé sur ce que l'importeur ignore

Date : 2026-09-24 · Statut : accepté (décision de l'auteur)

## Contexte

La limite WIP se lit par case (canal × colonne) depuis le design v12,
mais elle ne se réglait que par colonne, multipliée par le nombre de
canaux : « on n'a aucun endroit où la changer ». Et l'onglet Structure du
panneau permettait d'ajouter, renommer, réordonner ou supprimer colonnes,
canaux, domaines et types — ce que l'importeur ne suit pas : ses alias,
ses marqueurs, ses ancres de flux vivent dans le modèle versionné. « Si
tu ne peux pas retaper la configuration de l'importeur, tu ne peux pas
reconfigurer le tableau. » Depuis les colonnes sans canal (ADR 039),
l'onglet Structure ne tenait d'ailleurs plus.

## Décisions

1. **La limite est par case.** `config.wipLimits` : colonne → canal (ou
   `"*"` pour une colonne sans canal) → entier ≥ 1. Absente = aucune
   limite. `columns[].wip` disparaît. La case lit sa propre limite
   (`core/wip.ts` `cellWipLimit`) ; la colonne n'a une limite que si
   toutes ses cases en ont une, la somme (`columnWipLimit`, lue par
   « encours vs limites » de l'onglet Flux). Une limite avertit à 80 %,
   rougit au-delà, ne bloque jamais (§1). **Le modèle livré n'en porte
   aucune** (ADR 031 confirmé) : le PMO les posera « quand ils auront vu
   vivre le flux ».
2. **Le panneau est verrouillé sur ce que l'importeur ignore.** Six
   onglets : **Limites WIP** (la grille canal × colonne, remplace
   Structure), **Catégories** (renommer et recolorer domaines, types,
   natures, criticités — ne plus ajouter ni supprimer un domaine ou un
   type), **Champs de carte** (inchangé, l'importeur ne les lit pas),
   **Importer**, **Exercice**, **Instantanés**. Colonnes, canaux, gates,
   jalons, domaines, types, alias et sous-domaines se règlent dans
   `config/board.json` seulement.
3. **L'import entre dans le panneau** : la fenêtre d'import devient
   l'onglet Importer (le panneau s'élargit sur cet onglet) ; l'entrée
   « Importer un export PPM » du menu « ⋯ » y reste comme raccourci et
   ouvre le panneau sur cet onglet. Le pied « Réinitialiser · Annuler ·
   Appliquer » n'apparaît que sur les trois onglets qui éditent le
   brouillon.
4. **Rien ne change pour la règle d'import** (RDLI approuvé → Actifs) :
   les prochains imports se feront en amont de l'exercice, sans RDLI déjà
   passée, et les cartes seront déplacées à la main tout du long (auteur,
   2026-09-24).

## Conséquences

- `core/config-types.ts`, `core/config.ts` (`parseWipLimits` : colonne et
  canal connus, entier ≥ 1), `core/wip.ts` (+ tests), `core/metrics-flow.ts`
  (`wipRows` lit `columnWipLimit`), `config/board.json` (`wipLimits: {}`,
  plus de `wip` par colonne) ; `front/components/adminWip.tsx` (nouveau),
  `AdminPanel.tsx` (onglets, largeur, pied conditionnel), `adminTabs.tsx`
  (Structure retirée, Catégories sans ajout ni suppression),
  `ImportView.tsx` (`ImportPanel`, plus de fenêtre propre), `Cell.tsx`,
  `BoardGrid.tsx`, `UnifiedZone.tsx`, `useInteractions.ts` (`openAdmin`),
  `App.tsx`, `admin.css`.
- Le modèle versionné change : une configuration appliquée avant est
  écartée au redémarrage (ADR 038). Une configuration appliquée qui
  portait `wip` par colonne n'est plus lue — elle est dans l'historique.
- Le champ « jalon » ajouté à Structure par l'ADR 045 disparaît avec
  l'onglet : les jalons se règlent dans le modèle versionné seulement.
