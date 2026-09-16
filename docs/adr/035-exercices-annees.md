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

## Conséquences

- `core/types.ts` (`Card.exercise`, `CardEventType` `activated`,
  `CardPatch` `exercise`), `core/exercise.ts` (+ tests), `core/state.ts`
  (`EDITABLE.exercise`, cas `activated`), `core/aging.ts` (`isStale` gelé),
  `middle/validation.ts` (patch `exercise`), `middle/cards.ts`
  (`NewCardInput.exercise`, défaut `config.exercise.year`).
- Aucune migration de schéma ; les cartes existantes restent lisibles et
  suivent l'année en cours jusqu'à la première bascule, qui les épingle.
- Le journal reste la vérité : la bascule est lisible carte par carte
  (`activated`), les reports aussi (`edited`).
