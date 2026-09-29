# ADR 049 — Un seul menu « Paramètres » ; le Σ de la colonne des totaux dans le coin

Date : 2026-09-29 · Statut : accepté (décisions de l'auteur du jour) ·
Amende les ADR 038, 042, 046 et 048

## Contexte

L'en-tête portait un bouton « Analytics » et un menu « ⋯ » (Archives,
Importer, Configuration du tableau, ADR 038). La configuration du tableau
hébergeait en onglets l'import, la bascule d'exercice et les instantanés
(ADR 046) — des gestes qui n'ont « pas tant à voir » avec la configuration,
dit l'auteur. Le titre « Portfolio Kanban DSI » passait sur deux lignes dès
que les pastilles s'accumulaient. Le Σ qui déplie la colonne des totaux du
tableau (ADR 048) était dans la colonne elle-même ; les polices de cette
colonne étaient disparates.

## Décisions

1. **Un bouton engrenage** remplace le bouton « Analytics » et le menu
   « ⋯ ». Son menu, en trois groupes séparés : Analytics, Archives (avec
   leur nombre) ; Importer un export PPM, Exercice, Instantanés ;
   Configuration du tableau. Icône dessinée en SVG dans le code, sans
   bibliothèque.
2. **Import, Exercice et Instantanés s'ouvrent chacun seul**, sous leur
   propre titre, sans les onglets de la configuration. « Configuration du
   tableau » ne garde que Limites WIP, Catégories et Champs de carte.
3. **Le titre ne passe jamais sur deux lignes** : ce sont les pastilles
   (filtré, focus, tri, loupe) qui se tronquent quand la place manque.
4. **Le Σ de la colonne des totaux du tableau** est dans le coin en haut à
   gauche, sous celui des en-têtes, flèche vers le bas (vers le haut une
   fois dépliée) ; il n'est plus dans la colonne. Un clic sur la bande
   repliée la déplie toujours, en raccourci.
5. **Typographie de la colonne des totaux** : trois tailles (11 px pour le
   texte et les chiffres, 10 px pour le secondaire, 22 px pour le RAF
   engagé), chiffres tabulaires alignés à droite, ni capitales ni
   italique ; les k€ sur les mêmes lignes libellé / valeur que les RAF.

## Conséquences

- `front/App.tsx` (câblage `onExercise`, `onSnapshots`),
  `front/components/HeaderMenu.tsx`, `Chrome.tsx`, `AdminPanel.tsx`,
  `BoardGrid.tsx` (`GridCorner`), `BoardTotals.tsx` (`TotalsToggle`),
  `BoardGutter.tsx`, `GutterMetiers.tsx` (`MetiersHead`),
  `sidebarParts.tsx` (`CatHead` n'est plus partagé), `base.css`,
  `board.css`, `lens.css` ; `README.md`, `RUNBOOK.md`. Aucun changement de
  modèle, d'API ni de journal.
- Analytics demande un clic de plus (engrenage puis Analytics). Le nombre
  d'archives n'est plus visible en permanence dans l'en-tête : il est sur
  l'entrée Archives du menu.
- Échap ferme le menu de l'engrenage sans toucher au tableau.

- La passe graphique générale demandée le même jour est une proposition à
  part, sur une branche, à tester avant toute adoption.
