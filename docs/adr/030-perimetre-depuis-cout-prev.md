# ADR 030 — Le périmètre lu à la source : l'export COUT PREV (« Coût »), alias de domaines

Date : 2026-09-11 · Statut : accepté (décision de l'auteur, à contester à la revue)

## Contexte

Le périmètre embarqué depuis l'onglet Projets du PMO s'est révélé faux : les
exports fournis n'étaient pas les bons, et l'outil ne peut pas le savoir.
L'auteur a obtenu l'export brut des coûts prévisionnels de Sciforma
(« Coût », plus de douze mille lignes — celui que lit la macro
« Consolidation PDSI » d'un collègue, docs/CAPACITE-MACRO-PDSI.md) : une
ligne par projet × centre de coût × année, avec l'Id, le nom, le
portefeuille, le type, l'état du processus et le drapeau actif du projet.
Décision de l'auteur : « retirer la liste des projets par cet endroit-là ».

## Décision

1. **Huitième contrat, prioritaire pour le périmètre.** Un fichier reconnu
   comme COUT PREV (colonnes requises « Projet. Id », « Projet. Nom »,
   « Projet.Type », « Projet.Etat du processus », « Année ») devient LA
   source du périmètre ; l'onglet Projets, s'il est déposé aussi, ne sert
   plus qu'au recoupement (et, s'il porte des Responsable, aux chefs de
   projet comme avant).
2. **Règle de périmètre** (auteur) : un projet **unique par Id** est dans
   l'exercice s'il a au moins une ligne sur l'année de l'exercice, si son
   type n'est ni un **Achat** ni une **TMA** (« Evolution - TMA », « TMA
   Corrective »), et si son état n'est ni **Annulé** ni **Reporté**. Les
   types hors config (Pilotage, Projet ATLAS [Hors PDSI], RUN…) sont gardés
   sans type et questionnés ; « Projet.Actif » faux est compté, pas exclu.
3. **Ce qui n'est pas lu** dans ce fichier : montants et charges (pas à
   jour, auteur), « Projet.Responsable 1 » (mauvais responsable — ProjetsCdP
   fait foi), entités payeuses, nature, criticité, priorité, score.
4. **Domaine depuis le portefeuille.** Le dernier segment de
   « Projet.Portefeuille » est rapproché du vocabulaire du board par mots
   entiers : nom, code court ou **alias** du domaine (nouveau champ
   `domains[].aliases`, même mécanisme que les types), ou nom d'un
   sous-domaine (plus spécifique, donne aussi son domaine) ; à défaut sur
   le chemin entier ; ambiguïté → sans domaine, questionné. Les règles de
   la macro (`groupeDom`) vivent ainsi dans la config, pas dans le code.
5. **Recoupement dit dans le rapport** : quand les deux fichiers sont là,
   la ligne « périmètre · recoupement » donne les effectifs, les communs et
   les **codes** présents d'un seul côté. Ce désaccord est l'information
   que l'auteur cherchait.
6. **Normalisation des en-têtes** : les espaces autour d'un point sont
   ignorés (« Projet. Id » ≡ « Projet.Id »), comme le fait la macro.

## Conséquences

- `adapters/csv-import/couts.ts` (lecteur, produit une `ProjetsTable` : le
  reste de l'assemblage — jalons, SP, PdC, CdP — ne change pas),
  `portfolio.ts` (résolveur), `registry.ts` (contrat), `orchestrate.ts`
  (priorité et recoupement), `assembly.ts` (lignes « périmètre » et
  « périmètre · recoupement »), `core/config-vocab.ts` et `config-types.ts`
  (`Domain.aliases`), `config/board.json` (alias INFRASTRUCTURE, GROUPE,
  INGENIERIE…, PRODUCTION), `normalize.ts` (points).
- Le rapport gagne une ligne de lecture du fichier (lignes, projets
  distincts, hors année, exclus par motif) et des douteux nominatifs par
  **libellé** (types et portefeuilles inconnus) — jamais par nom de projet.
- Ouvert : ajouter Pilotage / ATLAS / RUN au vocabulaire des types
  (décision auteur) ; lire un jour les lignes « Charge » de ce fichier par
  centre de coût (l'« appel de charges » de la macro) pour le recouper
  avec le plan de charge.
