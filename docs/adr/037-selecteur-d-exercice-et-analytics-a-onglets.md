# ADR 037 — Le sélecteur d'exercice dans l'en-tête ; les analytics à onglets Capacité · Flux, panneaux repliables

Date : 2026-09-16 · Statut : accepté (décisions de l'auteur, fin d'après-midi)

## Contexte

Depuis la séance B de l'ADR 035, on peut importer un exercice futur, mais
rien ne l'affiche : le tableau montrait l'année en cours, point. L'auteur
veut, en haut à gauche, « Portefeuille DSI » et un carré avec l'année,
cliquable, qui déroule les autres années (les cinq passées, toutes les
suivantes) pour préparer 2027 et revenir à 2026 ; les filtres et les
analytics doivent suivre l'année affichée. « NMO · Portfolio Sync » ne
veut rien dire dans le temps (un modèle ne reste pas nouveau ; l'outil
servira aussi à la revue de portefeuille) : on l'enlève.

Les analytics : l'auteur ne voyait toujours pas d'onglet — tout était dans
Capacité, « un peu beaucoup », désagréable à faire défiler. Il veut une
barre d'onglets en haut, Capacité et Flux (le tableau des métriques de
flux qu'on avait, « sur lequel on va peut-être travailler »), et des
tableaux qui se replient pour les lire les uns après les autres.

Enfin, le filtre « SUP » (SUPPORT OFFICE) ne correspondait à rien dans le
portefeuille : retiré.

## Décisions

1. **Sélecteur d'exercice** (`front/components/YearPicker.tsx`) : un badge
   carré « 2026 ▾ » à côté du titre ; le menu offre les cinq années
   précédentes, l'année en cours, les cinq suivantes et toute année qui
   porte des cartes (`core/exercise.ts` `selectableYears`), avec le statut
   (clos / en cours / en préparation) et le nombre de cartes
   (`cardCountsByYear`). L'année choisie borne **le tableau, les filtres,
   les compteurs, les archives, les analytics, la création d'une carte et
   l'exercice préselectionné de l'importeur** (`front/useDisplayCards.ts`
   `useExerciseShown`). Hors de l'année en cours, une puce le dit :
   « Préparation · horloge gelée » ou « Exercice clos ». Rien n'est encore
   verrouillé sur une année close (question toujours ouverte, §12) ; la
   bascule « changer d'année en cours » reste à faire.
2. **Analytics** (`AnalyticsView.tsx`) : une vue, une barre d'onglets
   **Capacité** (la vue existante, `CapacityTab`) et **Flux**
   (`FlowView.tsx`, nouveau) ; le titre de l'outil devient « Analytics ».
3. **Flux** : six KPI (en cours, bloqués, livrés 30 j / 90 j, lead time et
   cycle time moyens — `core/metrics-flow.ts`, qui existait sans vue depuis
   la v12), le tableau **« Temps par étape »** (`core/stage-dwell.ts`,
   nouveau : en cours et âge moyen actuel par colonne, séjours terminés et
   durée moyenne, calculés depuis les seuls évènements de position — les
   réordonnancements et changements de canal ne terminent pas un séjour ;
   l'étape aux séjours les plus longs est surlignée), « Encours vs
   limites », « Blocages ». Toujours des requêtes sur le journal, jamais
   un stockage de métriques (CLAUDE.md §4).
4. **Panneaux repliables** : la barre de titre de chaque panneau
   (`Panel` de `capacityPanels.tsx`) est un bouton ; repliés par défaut,
   l'indice reste lisible replié ; le tableau du temps par étape s'ouvre
   d'emblée.
5. **Titre** : « Portfolio Kanban DSI » (auteur, fin de journée) — le nom
   de l'instrument et le mot de la transformation, plutôt que l'objet
   « Portefeuille DSI » ; l'outil servira aussi à la revue de portefeuille.
6. **Config** : domaine `support_office` retiré (aucun alias ajouté

   ailleurs — le « SUP » n'était pas Supply chain, malentendu levé par
   l'auteur). Les cinq cartes de fixtures qu'il portait passent en
   SOUTIEN. Titre de la page : « Portefeuille DSI — Kanban ».

## Conséquences

- `core/exercise.ts` (`selectableYears`, `cardCountsByYear`),
  `core/stage-dwell.ts` (+ tests), `front/useDisplayCards.ts` (nouveau,
  sorti d'App.tsx), `YearPicker.tsx`, `AnalyticsView.tsx`, `FlowView.tsx`,
  `CapacityView.tsx` (devient l'onglet), `capacityPanels.tsx` (`Panel`
  repliable), `Chrome.tsx`, `App.tsx`, `ImportView.tsx` (`defaultYear`),
  `front/api.ts` (`NewCardInput.exercise`), styles `base.css` /
  `metrics.css`, `config/board.json`, fixtures.
- Reste de l'ADR 035 : la bascule « Changer d'année en cours » (épingler,
  archiver l'année close, `activated`), et les deux questions ouvertes.
