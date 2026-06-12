# ADR 003 — Adaptateur fixtures déterministe

## Contexte

Tout le développement, les démos et les tests se font sur données
synthétiques (seul adaptateur autorisé sur la machine personnelle). Le
critère d'acceptation « un écran, zéro défilement » doit être vérifiable
par un test, donc le jeu de données doit être stable.

## Décision

- Génération **déterministe** par PRNG seedé (mulberry32, écrit à la main,
  zéro dépendance). Même seed → même portefeuille, sur toute machine.
- ~112 sujets répartis par une **matrice de comptes par cellule** calculée
  d'abord, avec un plafond dur de 14 cartes par cellule : le respect du
  critère un-écran est garanti **par construction**, puis vérifié par le
  test d'acceptation (`adapters/fixtures/acceptance.test.ts`) contre le
  vrai `config/board.json` et les constantes de `core/layout.ts` (qui
  alimentent aussi le CSS — une seule source de vérité).
- Les libellés (sujets, responsables, raisons de blocage, tags) vivent dans
  `fixtures/dataset.ts` : vocabulaire SI d'entreprise générique, aucune
  référence sectorielle, aucune donnée réelle.
- Le générateur reçoit la topologie en paramètre : il fonctionne pour toute
  configuration valide (profils de répartition adaptés au 7-colonnes par
  défaut, repli uniforme sinon).
- « Maintenant » est un paramètre : les tests utilisent une date fixe, l'UI
  passe la date courante. Les âges restent réalistes sans casser le
  déterminisme.

## Conséquences

- Un changement de seed ou de profils est un changement visible et
  intentionnel (les tests d'acceptation re-vérifient le critère un-écran).
- Le même bundle expose `seedEvents` (historique rétro-daté) — propriété
  des fixtures uniquement, voir ADR 002.
