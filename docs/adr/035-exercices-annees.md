# ADR 035 — Les exercices : une année en cours, des années en préparation ou closes

Date : 2026-09-16 · Statut : accepté (décision de l'auteur) — séance A réalisée, séances B et C à venir

## Contexte

Le tableau ne connaît qu'une année : `exercise.year` (config, ADR 024) dit
quelle année l'import lit et dans laquelle la capacité est comptée. Or la
vie du portefeuille chevauche les années : il faut **préparer 2027**
(importer les COUT PREV / plans de charge 2027, placer les cartes) pendant
que 2026 est encore le tableau principal, **sans que le décompte d'âge ne
parte** sur des cartes qui attendent janvier ; puis **basculer** 2027 en
tableau principal et **archiver 2026** une fois close. L'auteur veut
l'année en cours comme tableau principal, la possibilité d'ouvrir les
tableaux des autres années, et un bouton « changer d'année en cours ».

## Décision

1. **La carte porte son exercice** (`Card.exercise`, entier, facultatif).
   Une carte sans exercice (stockée avant cet ADR) appartient à l'année en
   cours, quelle qu'elle soit. Aucune migration : Postgres stocke la carte
   en jsonb, le champ apparaît quand il est écrit.
2. **Le statut d'une année se déduit, il ne se stocke pas** :
   `exercise.year` (config) est l'année **en cours** — le tableau
   principal ; une année inférieure est **close** ; une année supérieure
   est **en préparation**. `core/exercise.ts` : `exerciseOf`,
   `exerciseStatus` (closed / current / preparing), `exerciseYears`,
   `cardsOfExercise`, `isClockFrozen`.
3. **Horloge gelée en préparation** : une carte dont l'exercice est
   supérieur à l'année en cours n'est jamais « stale » (`isStale`) — son
   décompte ne compte pas, quelle que soit sa date d'entrée en colonne.
   Une année close garde ses âges tels quels (lecture, pas de gel).
4. **Un évènement `activated`** par carte marque la bascule : le fold prend
   sa date comme entrée en colonne (position inchangée, aucune entrée
   d'étape comptée) — le décompte démarre le jour où l'année devient
   l'année en cours. L'évènement est écrit par le serveur seul (il n'est
   pas dans les intents postables par le front).
5. **L'exercice s'édite** (`edited`, patch `exercise`, entier 2000–2100) :
   c'est ainsi qu'une carte se **reporte** d'une année sur l'autre, ou que
   les cartes historiques (sans exercice) sont **épinglées** sur l'année qui
   se clôt au moment de la bascule — avant que « l'année en cours » ne
   change de valeur, sinon elles suivraient la nouvelle année.
6. **La création** (`POST /api/cards`) accepte un `exercise` facultatif,
   par défaut l'année en cours.

Séances suivantes (planifiées, non réalisées) :

- **S-B — import par exercice** : sélecteur « Exercice » dans l'importeur
  (défaut : année en cours) ; l'audit lit l'année choisie ; les cartes
  importées sont estampillées ; « absentes du dernier import » scopé à
  l'exercice importé ; capacité stockée par année (table `capacity` clé
  année).
- **S-C — front et bascule** : sélecteur « Exercice 2026 ▾ » en en-tête
  (le tableau montre un exercice à la fois, `cardsOfExercise`) ; bandeau
  « Préparation 2027 — horloge gelée » ; années closes en lecture seule ;
  bouton admin « Changer d'année en cours » = épingler les cartes sans
  exercice sur l'année qui se clôt, écrire `activated` sur chaque carte de
  la nouvelle année, puis passer `exercise.year` (override de config).

Questions laissées à l'auteur (§12 de CLAUDE.md) : une année close
reste-t-elle visible pour toujours dans le sélecteur ? « archiver l'année
passée » = lecture seule, ou `archived` carte par carte ? le report d'une
carte 2026 → 2027 est-il permis (et à qui) ?

## Complément du 2026-09-16 (après-midi) — le modèle de l'auteur, séance B réalisée

L'auteur précise le modèle, et il tranche deux des trois questions :

- **Les codes PE disent l'année de départ du projet ; les projets
  pluriannuels sont normaux.** Une carte est **l'instance d'un projet dans
  UN exercice** : « PE machin, mais de cette année », avec le budget de cette
  année. Les cartes de l'année suivante sont d'autres cartes — **deux
  tableaux différents**.
- **Les reliquats** d'une année sur l'autre ne se reportent pas à la main :
  « on va les chercher » dans l'export de l'année suivante, où ils sont
  **rebudgétés**. Même code PE, autre carte, autre budget. Le patch
  `exercise` reste un outil de correction, pas le chemin normal.
- **À la clôture**, la carte de l'année passée **est archivée**.

Ce que la séance B en fait :

1. **Identité par exercice** : l'identifiant d'une carte importée est
   `<code>@<année>` (`core/exercise.ts` `instanceId`, `to-cards.ts`
   `cardId`). Les cartes stockées avant cet ADR gardent leur identifiant nu
   (le journal les référence) : au ré-import de l'année en cours, la carte
   nue est rafraîchie en place et estampillée ; le snapshot de capacité,
   construit avec les identifiants suffixés, est remis sur les identifiants
   stockés (`withLegacyIds`, `LoadPlan.aliases`).
2. **Un import ne touche que son exercice** : `planLoad(…, year)` ne lit,
   ne rafraîchit, ne déplace et ne marque « absente » que les cartes de
   l'année importée (`cardsOfExercise`). Un import 2027 ne lit ni n'écrit
   une carte 2026 ; les placements à la main restent protégés comme avant
   (ADR 026).
3. **L'audit lit l'exercice demandé** (`runImportAudit(…, year)` :
   contrats de l'année, année COUT PREV, capacité) ; le rapport et le
   résultat portent `exercise`.
4. **Garde-fous du chargement** (`middle/import.ts`, CLI `--exercice`) :
   refusé pour une année **close** (inférieure à l'année en cours) ; refusé
   quand **aucun projet n'est retenu** sur l'année demandée (« fichiers
   d'une autre année ? ») — avant que quoi que ce soit ne soit marqué
   absent.
5. **Capacité par année** : `BoardStorage.getCapacity(year)`, une ligne
   par exercice (`capacity.id` = l'année ; l'ancienne ligne `current` est
   lue en repli pour sa propre année). `GET /api/capacity?exercise=YYYY`.
6. **Front** : sélecteur « Exercice » dans l'importeur (année en cours,
   +1, +2 « en préparation »), corps `exercise` ; le tableau, les archives
   et la vue capacité ne montrent que **l'exercice en cours** (le sélecteur
   d'en-tête vient en séance C).

Reste ouvert pour la séance C : une année close reste-t-elle visible dans
le sélecteur pour toujours ? et qui peut encore éditer une année qui se
clôt (lecture seule stricte, ou correction admin) ?

## Conséquences

- Séance B : `adapters/csv-import/to-cards.ts` (`cardId(card, year)`,
  `baseCardId`, `resolveId`, `withLegacyIds`), `capacity.ts` (identifiants
  suffixés), `orchestrate.ts` (`year`), `middle/import.ts`
  (`parseExercise`, `loadableDeck`), `middle/validation.ts`
  (`exerciseOrCurrent`), `middle/app.ts`, `core/ports.ts`, les deux
  pilotes de stockage, `core/import-types.ts` (`exercise`), `sync/import.ts`
  (`--exercice`), `front/api.ts`, `ImportView.tsx`, `CapacityView.tsx`,
  `App.tsx` (`useDisplayCards` scopé).
- `core/types.ts` (`Card.exercise`, `CardEventType` `activated`,
  `CardPatch` `exercise`), `core/exercise.ts` (+ tests), `core/state.ts`
  (`EDITABLE.exercise`, cas `activated`), `core/aging.ts` (`isStale` gelé),
  `middle/validation.ts` (patch `exercise`), `middle/cards.ts`
  (`NewCardInput.exercise`, défaut `config.exercise.year`).
- Aucune migration de schéma ; les cartes existantes restent lisibles et
  suivent l'année en cours jusqu'à la première bascule, qui les épingle.
- Le journal reste la vérité : la bascule est lisible carte par carte
  (`activated`), les reports aussi (`edited`).
