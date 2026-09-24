# ADR 045 — Les jalons du référentiel en tête de colonne : RDO, RDLI, Kick-off, RDR, et la gate qu'ils conditionnent

Date : 2026-09-24 · Statut : accepté (demande de l'auteur)

## Contexte

Les en-têtes de colonnes portaient les deux gates de qualité (DoR sur
Prêts, DoD sur Done) sans dire à quelle revue du référentiel elles se
rattachent. L'auteur veut voir les jalons du processus « au bon endroit »
sur le tableau : RDO à la qualification, RDLI avant Prêts, le kick-off à
l'entrée d'Actifs, RDR à Done — et les critères d'entrée et de sortie
« en dessous » de la revue qu'ils conditionnent : DoR sous RDLI, DoD sous
RDR. Discrètement : « de petits marquages… on veut que tout soit joli ».

## Décisions

1. **Vocabulaire, pas comportement.** La colonne gagne un champ `review`
   (texte court, 16 caractères au plus, ou null) : le jalon marqué à
   l'entrée de la colonne, écrit tel quel (« RDO », « RDLI », « Kick-off »,
   « RDR »). Rien n'est vérifié par le logiciel — comme les gates, ce sont
   des décisions humaines en gouvernance (§1, ADR 013). Le champ se règle
   depuis ⚙ › Structure, à côté de la gate.
2. **Le modèle versionné** place RDO sur Qualification, RDLI sur Prêts
   (au-dessus de DoR), Kick-off sur Actifs, RDR sur Done (au-dessus de
   DoD).
3. **L'écran** : à droite de l'en-tête, avant le caret de repli, une
   petite pile — le jalon en 7 px, gras, gris, au-dessus du badge de gate
   existant. Une colonne sans jalon ni gate n'a rien. La ligne de gate au
   bord de la cellule (DoR, DoD) ne change pas ; les jalons n'en ont pas.
   La colonne repliée (bande de 30 px) ne porte pas les marques. La
   hauteur d'en-tête mesurée pour le critère un écran est inchangée.

## Conséquences

- `core/config-types.ts` (`Column.review`), `core/config.ts`
  (`parseReview` : texte trimé ou null, vide = null, 16 caractères au
  plus), tests ; `config/board.json` ; `front/components/ColumnHeads.tsx`
  (`ColumnMarks`), `adminTabs.tsx` (champ « Jalon »), `board.css`,
  `admin.css`.
- Une configuration appliquée depuis ⚙ avant ce changement est écartée au
  redémarrage, comme pour tout changement du modèle versionné (ADR 038) :
  la refaire depuis ⚙ si besoin.
