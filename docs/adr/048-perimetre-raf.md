# ADR 048 — Périmètre RAF : reste à faire engagé / non engagé, loupe par métier

Date : 2026-09-28 · Statut : accepté (décisions de l'auteur du jour),
tranche A livrée · Amende les ADR 020 et 044

## Contexte

La Revue Stratégique de Portefeuille du 1er octobre pose une question aux
responsables des domaines fournisseurs : « il y a N j.h de ton métier à
faire d'ici le 31/12, soit environ X personnes ; tu les as ? sinon, sur
quels projets ? ». Le tableau montrait un « Charge … j.h RAF » par colonne
qui mélangeait trois choses : le reste à faire annuel par métier, le repli
sur l'effort de la carte (un chiffre projet, pas annuel) quand elle n'a
pas de plan par métier, et une borne à zéro prise sur le groupe (un métier
trop consommé sur une carte effaçait le reste à faire d'un autre). Aucune
distinction entre le travail qui mobilise déjà les équipes et celui qui
attend.

## Décisions

1. **Une seule arithmétique.** Le reste à faire d'une carte sur des
   métiers = la somme, sur ces métiers (ceux de la configuration
   seulement), de max(0, prévu − consommé) de son plan de charge par
   métier, arrondi au centième par carte × métier. Jamais de repli sur
   l'effort de la carte : une carte sans plan par métier vaut 0 et compte
   « sans ventilation ». Tout RAF affiché (en-tête, canal, gouttière,
   carte, tri « reste à faire ») est une simple somme de ces valeurs sur
   les cartes visibles : la gouttière vaut exactement la somme des
   en-têtes (`core/raf-card.ts`, `core/totals.ts`, `core/raf.ts`).
2. **Trois classes de colonnes**, dérivées des ancres de flux et du
   premier gate DoR, jamais d'un identifiant écrit en dur
   (`core/column-class.ts`) : **engagé** = Qualification, Études/Cadrage,
   Actifs (en Qualification et en Études, les ateliers mobilisent déjà
   les architectes) ; **non engagé** = Demandes, Prêts, Pause ; **hors
   calcul** = Terminé et après. Le RAF d'un canal laisse le hors calcul
   de côté ; ses k€ non.
3. **Les mots.** En-tête : « RAF engagé » (encre, fin liseré sombre en
   haut de la colonne), « RAF non engagé » (gris), « RAF hors calcul ».
   Le budget « Engagé » (k€) devient « Budget engagé » ; dans Analytics,
   « Engagement » devient « Taux de charge ».
4. **La gouttière du tableau** (à gauche de Demandes) a son propre Σ,
   « tableau », replié par défaut et mémorisé — le troisième booléen du
   navigateur (amende l'ADR 020). Dépliée : le périmètre, le RAF engagé en
   grand et « ≈ N pers. d'ici le 31/12 », le non engagé, le hors calcul,
   la légende des classes, le diviseur (jours ouvrés restants jusqu'au
   31/12, fériés déduits, congés non — `core/workdays.ts`), la note des
   sujets sans ventilation, une ligne k€, puis la liste des métiers.
   Les personnes ne s'affichent que sur l'exercice courant.
5. **La loupe par métier** : chaque métier se coche, « tout · rien »
   comme les filtres. Elle change ce que compte le RAF partout à la fois
   (en-têtes, canaux, gouttière) ; valeurs en couleur d'accent et
   périmètre en infobulle quand elle restreint, pastille « RAF : … ✕ »
   dans l'en-tête. État de séance : en mémoire seulement, un
   rechargement revient à « tous métiers », Échap ne l'efface pas. Rien
   n'est écrit, ni au journal ni dans le navigateur. L'ordre des lignes
   est figé tant qu'elle est active.
6. **Le tri « reste à faire »** (ADR 044) suit la règle 1 : les cartes
   sans plan par métier n'ont plus de chiffre et passent en fin de liste.
7. **La capacité reste hors de l'outil** pour cette mission : le chiffre
   en personnes se compare à l'effectif que les responsables de domaine
   annoncent en séance.

## Conséquences

- Sur la VM, le RAF des en-têtes baisse pour les cartes sans plan annuel
  par métier (plus de repli) et peut monter là où un métier trop
  consommé effaçait les autres. En local, les fixtures ont toutes un plan.
- `core/metrics.ts` garde son calcul (jh/done avec repli) : il n'est plus
  lu par aucun chiffre du tableau.
- Reste à faire (tranche B) : le tri « reste à faire » et le RAF de la
  carte dépliée suivent la loupe ; la clé de tri « par métier » et sa
  liste disparaissent. Après la séance (tranche C) : les cartes sans RAF
  sur les métiers comptés en bas de cellule, avec la règle de dépôt.
- En séance, Pause est dépliée au départ : une colonne repliée ne reçoit
  pas de dépôt (son RAF reste lisible dans son infobulle).
