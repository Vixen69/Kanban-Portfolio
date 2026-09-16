# ADR 036 — Le domaine ne s'écrase pas : conflits tranchés un par un à l'import, marqueur « [Business] », domaine PROJETS VENDUS

Date : 2026-09-16 · Statut : accepté (décisions de l'auteur, séance de l'après-midi)

## Contexte

Depuis l'ADR 026, l'export gagne sur les « faits » d'une carte (budgets,
charge, domaine, chef de projet, dates) et le tableau gagne sur la
position placée à la main. Or le **domaine** n'est pas un fait comme les
autres : c'est l'axe d'arbitrage des responsables de domaine, qui ont
besoin de dire « ça, c'est mon portefeuille » ou « ça, ce n'est pas le
mien ». Le chef de projet, lui, se remet à la main sans drame (auteur :
« un non-sujet »).

Les projets **vendus** ont révélé le problème (2026-09-15, entretiens
RDOM) : rattachés dans Sciforma à un portefeuille client mal lisible pour
la DSI, ils se retrouvaient en Architecture & Développement par le repli
sur le chemin entier (« GROUPE… »). Leur nom porte souvent un code entre
crochets contenant « business » ; quand il est là, c'est un projet vendu
« évident ». Plusieurs cartes déjà chargées sont donc mal taguées, et
l'auteur doit ré-importer sans rien casser de ce qu'il a placé.

## Décisions

1. **Le domaine n'est plus écrasé silencieusement.** Une carte déjà
   présente dont le domaine ou le sous-domaine stocké diffère de ce que
   l'export et les règles proposent est un **conflit**. L'audit les liste
   (titre, code, valeur du tableau, valeur proposée, règle qui a joué, ce
   que le journal dit déjà). Une carte nouvelle prend le domaine de
   l'export ; un export qui n'a résolu aucun domaine ne fait pas de
   conflit (le tableau en sait plus que rien) ; un sous-domaine que la
   config ne déclare plus compte comme « aucun ».
2. **Un par un.** Le panneau de l'importeur présente les conflits un à la
   fois, « Garder » ou « Remplacer », avec un récapitulatif des décisions
   prises (modifiables) ; « Tout remplacer » et « Tout garder » sont des
   raccourcis. **Pas de défaut** : le chargement est refusé tant qu'un
   conflit n'est pas tranché. En ligne de commande, `--domaines
   garder|remplacer` tranche tout pareil, sinon refus.
3. **Chaque décision est un évènement** `edited` signé `import-csv`
   (`payload.decision`, `payload.proposed`, `payload.board`). « Remplacer »
   patche le domaine ; « Garder » patche la carte à sa propre valeur (sans
   effet sur le fold) et mémorise la proposition refusée : **le même
   conflit n'est pas reposé** tant que l'export propose la même chose ;
   une autre proposition rouvre le conflit, marqué « gardé le … ». Un
   domaine corrigé à la main dans la fiche apparaît « posé à la main le … ».
4. **Marqueur dans le nom** : `domains[].nameMarkers` (config). Un marqueur
   trouvé en mot entier **entre crochets seulement** dans le nom du projet
   force son domaine, **avant** la lecture du portefeuille. C'est un
   garde-fou, jamais une devinette sur du texte libre (« Reporting business
   unit » ne matche pas ; « [Business] », « [BUSINESS-2026] » matchent).
   Deux domaines marqués = ambigu = rien.
5. **Domaine « PROJETS VENDUS »** (`vendus`, short « VDU » — trois lettres
   comme les autres) : mots de
   portefeuille « PROJET VENDU », « PROJETS VENDUS » ; marqueur « BUSINESS ».
   Le failsafe de l'auteur tant que la logique des portefeuilles vendus
   n'est pas comprise (question de fond toujours ouverte, CLAUDE.md §12).
6. **Le sous-domaine « Architecture applicative » d'A&D est retiré** : plus
   aucun projet ne s'y rattache. Les cartes qui le portaient s'affichent
   en A&D sans sous-domaine, sans conflit (règle 1).
7. **Le type et le chef de projet restent des faits** que l'export met à
   jour sans demander (auteur, 2026-09-16).

## Conséquences

- `adapters/csv-import/domain-conflicts.ts` (nouveau : `priorDomainDecisions`,
  `domainConflict`, `domainDecisionEvent`), `to-cards.ts` (`settleDomain`,
  `refreshPosition`, `planLoad(…, decisions)`, `LoadPlan.domainConflicts`),
  `card-identity.ts` (identité scindée, ADR 035), `portfolio.ts`
  (`createNameMarkerResolver`, `ruleLabel`, portée « name »), `enrich.ts`
  (`domainOf`, `domainRule`, `withMarker`), `couts.ts` / `projets.ts`
  (`domainRule`), `core/import-types.ts` (`DomainConflict`, `DomainDecision`),
  `core/config-types.ts` + `config-vocab.ts` (`nameMarkers`), `middle/import.ts`
  (`auditImport` lit le tableau, `parseDecisions`, refus sans décision),
  `front/components/ImportConflicts.tsx` (nouveau), `ImportView.tsx`,
  `sync/import.ts` (`--domaines`), config `board.json` (domaine `vendus`,
  sous-domaine retiré).
- Le ré-import de l'auteur : sauvegarde `pg_dump` (RUNBOOK), audit (essai à
  blanc, liste des conflits), décisions une par une, chargement. Rien n'est
  supprimé ; chaque changement de domaine est lisible dans l'Historique de
  la carte et réversible depuis la fiche.
- La position (ADR 026) n'est pas concernée : une carte placée à la main ne
  bouge toujours pas, la divergence reste signalée.
