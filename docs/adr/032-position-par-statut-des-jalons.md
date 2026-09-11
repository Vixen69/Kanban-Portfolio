# ADR 032 — La position initiale lue dans le statut des jalons ; RDR approuvé = Done

Date : 2026-09-11 · Statut : accepté (décision de l'auteur)

## Contexte

Depuis le 2026-09-08 (R7), la position initiale d'une carte venait des
**dates** des jalons de `ProjetsJalons` (RDO / RDLI / RDR passées au jour
de l'audit), la cellule « … franchi » ne décidant qu'à défaut de date. Sur
les exports réels, dates et « franchi » se contredisaient (9 + 7 + 4
lignes en septembre) : « actuellement c'est trop imparfait » (auteur).
L'export porte pourtant, pour chaque jalon, une colonne **« (Statut) »**
— « Approuvé » ou « Planifié » — que l'outil relevait sans la lire.

## Décision

1. **Le statut décide.** « RDO (Statut) », « RDLI (Statut) », « RDR
   (Statut) » : « Approuvé » = jalon franchi ; « Planifié » ou toute autre
   valeur = non franchi (les valeurs vues sont relevées au rapport).
2. **La date et « franchi » confirment.** Un désaccord avec le statut est
   compté (« « RDO » passé mais statut « Planifié » — le statut fait
   foi ») ; le statut gagne. Sans statut (colonne absente ou cellule
   vide), l'ancienne règle reste en repli : la date, puis « franchi ».
3. **RDR approuvé = Done** (auteur) : RDR → colonne terminale (`done`,
   sinon la colonne à porte DoD) ; RDLI → Actifs ; RDO → Études ; sinon
   la colonne d'entrée. **Exploitation n'est plus dérivée de l'import** :
   c'est un mouvement manuel.
4. La ligne « position » du rapport dit combien de cellules de jalon
   chaque chemin a décidées (statut / date / « franchi »).

## Conséquences

- `adapters/csv-import/jalons.ts` (`Stage` = done | actifs | etudes |
  entree, `JalonsTable.reading`, relevé des statuts), `assembly.ts`,
  fixture `ProjetsJalons.csv` (statuts « Approuvé » / « Planifié »),
  tests, IMPORT-MAPPING R7, RUNBOOK.
- Un ré-import repositionne les cartes dont le statut diffère de la date
  (position = fait de l'instantané, le journal garde l'historique).
