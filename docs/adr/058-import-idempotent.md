# ADR 058 — Les mêmes fichiers donnent le même tableau

Date : 2026-09-30 · Statut : proposé (branche import-lisible) · Précise les
ADR 019, 026, 032, 035, 038, 042 et 054 · Amendé par l'ADR 060 (§3,
position)

## Contexte

L'enquête du 30 septembre sur l'import (déterminisme, idempotence,
périmètre) a trouvé des cas où **les mêmes fichiers** ne donnent pas le
même tableau, ou où recharger écrit à nouveau ce qui l'est déjà : la date
d'un jalon sans statut comparée au jour du chargement (et au fuseau du
serveur) ; deux lignes SP de deux Id différents sous un même nom (l'une
empruntait les k€ de l'autre, selon l'ordre des lignes) ; un Id en double
dans ProjetsJalons (la première ligne gagnait) ; un simple reclassement
dans une cellule (ADR 019) ou un changement de canal qui figeait la carte
contre l'export ; l'import qui lisait le journal **brut** au lieu du
journal relu à travers les restaurations (ADR 042) ; une carte supprimée
« recréée » à chaque chargement ; une restauration qui laissait la capacité
écrite après l'instantané, et remettait une configuration appliquée sur un
ancien board.json ; un « Début » à venir qui datait l'événement `imported`
dans le futur ; des sommes de plan de charge arrondies à chaque addition ;
deux identités tirées d'un nom long coupé à 48 caractères ; deux
chargements simultanés qui créaient chacun toutes les cartes.

## Décision

1. **Jour de référence des jalons** : une date de jalon sans statut est
   comparée à la **date d'export** des fichiers (la plus récente cellule
   « Date d'export » / « Date export » reçue), à défaut au jour du
   chargement — toujours un jour **Europe/Paris**. Le rapport dit lequel.
2. **Jointures** : l'Id d'abord. Le nom (ou le code dans le nom) ne sert
   que si la carte n'a pas trouvé sa ligne par son Id, que ce nom n'est
   porté que par une ligne, et que cette ligne ne porte pas un **autre**
   Id. Deux Id sous un même nom : deux projets, un douteux, aucun coût
   emprunté. Un Id en double dans ProjetsJalons : l'étape la plus avancée
   lue sur ses lignes, quel que soit leur ordre, et un douteux.
3. **Position** : seul un déplacement **vers une autre colonne**, à la main,
   fige une carte (ADR 026) — sauf jalon nouveau et plus avancé, qui la
   déplace (amendé par l'ADR 060). Un reclassement dans la cellule ou un
   changement de canal ne la fige pas ; l'export ne place que la colonne,
   jamais le canal d'une carte existante. L'import lit le journal **relu
   à travers les restaurations** pour tout : déplacements à la main,
   décisions de domaine, suppressions.
4. **Carte supprimée** : un projet dont la carte importée a été supprimée
   au tableau n'est pas recréé : ignoré, compté et nommé (« supprimées du
   tableau, ignorées »), aucun événement écrit. Une carte créée à la main
   puis supprimée ne bloque pas l'export.
5. **Restauration** : elle retire la capacité des exercices dont
   l'instantané n'avait pas ; elle ne remet une configuration appliquée
   que sur le board.json où elle avait été appliquée — sinon elle la
   **met de côté** dans l'historique (ADR 038). Un instantané d'avant cette
   décision ne dit pas sur quel modèle : sa configuration n'est reprise
   que si c'est celle qui tourne déjà.
6. **Dates** : l'événement `imported` n'est jamais daté après le
   chargement (la carte garde son vrai « Début »). Un déplacement que le
   journal porte déjà (dernier mot de l'import) n'est pas réécrit.
7. **Sommes** : les jours du plan de charge s'additionnent exactement,
   arrondis une seule fois à deux décimales.
8. **Identités tirées du nom** : seules celles qui se heurtent prennent un
   suffixe tiré du nom complet ; les autres ne changent pas. Deux cartes de
   l'export sur une même identité : la seconde est écartée et dite.
9. **Un chargement à la fois** : les chargements passent dans la file des
   écritures du tableau.

## Conséquences

- Recharger les mêmes fichiers n'écrit rien ; les recharger un autre jour
  non plus, dès qu'ils portent leur date d'export.
- ~~Limite connue : les événements `imported` déjà datés dans le futur (avant
  cette décision) gardent la carte dans sa colonne d'entrée jusqu'à cette
  date ; l'import ne les réécrit plus, mais le pli par date les applique
  encore en dernier — le corriger toucherait le pli (décision de l'auteur).~~
  **Levée le 30/09** (amendement ci-dessous).
- L'identité tirée d'un nom ne dépend pas des autres projets du lot : le
  chargement retrouve d'abord celle que le tableau porte déjà pour ce
  projet (avec ou sans suffixe, le titre fait foi). Un projet chargé seul
  puis avec un homonyme garde sa carte ; l'homonyme prend l'identité
  suffixée. Un dépôt partiel qui omet l'un des deux ne crée plus de
  doublon et ne fait plus alterner absente / de retour.
- Stockage : une méthode `clearCapacity` (JSONL et PostgreSQL) ; les
  instantanés notent le modèle sur lequel leur configuration était
  appliquée.

## Amendement (2026-09-30, reprise de revue)

1. **La naissance d'une carte se lit d'abord.** Le pli lit toujours le
   journal par date, puis par numéro d'ordre — sauf l'événement de
   création d'une carte (`imported` ou `created`, le premier que le
   journal a écrit pour elle), lu avant tous ses autres événements, quelle
   que soit sa date (`core/fold-order.ts`). Sur les journaux de la VM
   écrits avant cette décision (« Début » à venir), les déplacements faits
   à la main depuis s'appliquent enfin ; tant qu'aucun geste ne l'a
   déplacée, la carte attend dans sa colonne d'entrée, âge 0 (jamais
   négatif). Une absence (∅) marquée après n'est plus effacée par cette
   création datée plus tard. Les restaurations (ADR 042) et les
   reclassements (ADR 019) se lisent comme avant ; un `imported` écrit
   après d'autres événements de la carte n'est pas une naissance et garde
   sa place par date. Les Délais de la fiche et le temps par étape lisent
   le même ordre. Rien n'est réécrit dans le journal.
2. **ProjetsCdP suit la règle des jointures (§2).** Le chef de projet se
   joint par l'Id ; par le nom seulement si les lignes de ce nom ne portent
   pas un **autre** Id que celui de la carte (sans Id sur la carte : pas
   deux Id sous ce nom). Sinon : aucun chef de projet emprunté, un douteux
   « ProjetsCdP : le nom désigne un autre Id que celui de la carte ».
3. **La commande prend aussi l'instantané.** `sync/import.ts --charger`
   prend l'instantané automatique « avant chargement <année> » (acteur
   `import-csv`) une fois le chargement accepté, avant d'écrire — comme
   l'outil (ADR 042, même fonction `takeSnapshot`) ; « Voir ce qui a
   changé depuis le dernier import » le retrouve.
