# ADR 044 — Trier les cartes : par reste à faire, par meilleur estimé, par métier

Date : 2026-09-21 · Statut : accepté (demande de l'auteur)

## Contexte

L'instance d'arbitrage qui vient n'est pas une revue classique : le but
est de **geler une partie du portefeuille pour faire avancer le reste**.
L'auteur veut que les responsables de domaine s'y comportent en équipe.
Passer d'un domaine à l'autre avec les filtres, c'est « passer au grill
une personne après l'autre ». Il faut au contraire regarder, tous
domaines mêlés, ce qui coûte aux métiers rares.

La donnée existe sur la carte : `chargeByProfile`, la charge planifiée et
consommée par profil DSI (ADR 014), la même que la ventilation des
en-têtes de colonnes (ADR 020).

## Décisions

1. **Un tri, pas un filtre.** Rien ne disparaît. Quatre clés, une seule à
   la fois : l'ordre du tableau, le reste à faire de la carte en j.h, le
   meilleur estimé en k€, le reste à faire des métiers cochés (la somme
   de leur planifié moins consommé sur la carte). Un ordre, décroissant
   ou croissant (`core/card-sort.ts`).
2. **Une vue, jamais un évènement.** Le tri n'écrit rien. L'ordre manuel
   (ADR 019) reste dessous et revient quand on quitte le tri. Tant qu'un
   tri est actif, déposer une carte sur une autre ne la réordonne plus :
   c'est un simple déplacement dans la cellule de la cible, ou rien si la
   carte y est déjà. Les déplacements entre colonnes et canaux restent.
3. **Les cartes sans chiffre vont en bas, dans les deux sens.** Un tri
   croissant ne doit pas mettre en tête les cartes sans donnée. À chiffre
   égal, l'ordre du tableau départage : le tri est stable.
4. **La mauvaise donnée se voit.** Une carte sans ventilation par métier
   ne peut pas être classée par métier : la pastille d'en-tête et la
   section de tri disent combien de cartes affichées sont dans ce cas, et
   la carte étendue écrit « sans ventilation ». C'est un révélateur
   assumé du pointage, pas un défaut à masquer.
5. **L'écran.** Barre latérale, sous la recherche : section « Trier les
   cartes », repliée par défaut, le tri en cours écrit sur sa ligne de
   titre ; la liste des métiers se replie, elle ne montre que les métiers
   qui ont du reste à faire sur les cartes affichées, du plus chargé au
   moins chargé, avec leur total. En-tête : pastille « Trié par … ·
   décroissant » avec une croix. Carte étendue d'une colonne en focus :
   un bloc vertical « RAF par métier » avec les trois plus gros restes à
   faire, les métiers du tri devant et en gras, « 3 sur N » quand il y en
   a davantage ; la valeur du tri est écrite sur la carte.
6. **Portée.** Le tri s'applique à tout le tableau, tickets compacts
   compris ; le bloc des métiers n'existe qu'en vue étendue. État de
   session : rien n'est mémorisé dans le navigateur.

## Conséquences

- `core/card-sort.ts` (+ tests) : `sortCards`, `sortValue`, `cardLoad`
  (la règle du reste à faire, désormais partagée avec la carte étendue),
  `topProfiles`, `profileRemainingTotals`, `withoutBreakdown`.
- `front/useCardSort.ts`, `front/components/SortSection.tsx`,
  `front/components/ProfileBlock.tsx` ; `useDisplayCards.ts`
  (`useBoardCards`), `useInteractions.ts` (dépôt sur carte sans
  réordonnancement pendant un tri), `App.tsx`, `Sidebar.tsx`,
  `Chrome.tsx`, `BoardGrid.tsx`, `Cell.tsx`, `UnifiedZone.tsx`,
  `cards.tsx`, `cardParts.tsx`, `lookup.ts`, `cards.css`, `sidebar.css`.
- Le critère un écran est inchangé : la vue compacte n'est pas touchée,
  la section est repliée par défaut.
- Source retenue : la charge par profil de la carte. Le plan de charge
  importé (par personne et par métier, ADR 033) reste une lecture possible
  plus tard ; il dépend d'un import et ne parle pas en profils.

## Amendement (ADR 048, 2026-09-28)

La clé « Reste à faire par métier » et sa liste de cases disparaissent :
la loupe par métier de la gouttière du tableau les remplace. La clé
« Reste à faire » compte les métiers de la loupe (tous par défaut), sans
repli sur l'effort de la carte : les cartes sans plan par métier n'ont plus
de chiffre et vont en fin de liste, la pastille les compte — tant que la
loupe compte tous les métiers ; dès qu'elle en restreint, elles
disparaissent avec les cartes hors périmètre. Le bloc « RAF
par métier » de la carte dépliée met en tête les métiers de la loupe et
grise les autres. `cardLoad` (la règle vit désormais dans
`core/raf-card.ts` : `cardRaf`, `profileRemaining`), `profileRemainingTotals`
et `withoutBreakdown` sont retirés ; `topProfiles` prend le périmètre de
la loupe. La loupe filtre comme les autres filtres (ADR 048,
décisions 5 et 7) ; elle ne touche pas au glisser-déposer : seule la règle
de dépôt pendant un tri demeure. Le tri a trois clés.
