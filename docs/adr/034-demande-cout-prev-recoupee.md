# ADR 034 — La demande COUT PREV par centre de coût, recoupée avec le plan de charge

Date : 2026-09-11 · Statut : accepté (décision de l'auteur, essai à confirmer sur données réelles)

## Contexte

La macro « Consolidation PDSI » d'un collègue tire toute sa lecture de
capacité du seul export **COUT PREV** : ses lignes « Charge » donnent, par
projet et par **centre de coût** (CdP INFRA BUILD, Concept.Dév.…), les jours
« Charge finale ME (Res) (J) » — l'« appel de charges ». Nous lisons la même
demande dans le **plan de charge** (affectations par ressource, ADR 029/033).
Deux saisies de la même chose ; l'auteur doute des charges de COUT PREV mais
veut voir lesquelles « sont dans une meilleure tête ». Le centre de coût et
le « Métier » du PdC parlent le même vocabulaire.

## Décision

1. **Lire les lignes « Charge » de COUT PREV** (`Type de centre de coût` =
   « Charge », année de l'exercice) sur les **projets retenus** : jours par
   (projet, centre de coût), `Charge finale ME (Res) (J)` en prévisionnel,
   `Charge réelle ME (Res) (J)` en réalisé (`CoutsTable.charges`). Ces jours
   n'entrent **pas** dans les cartes (SP reste la source des k€, le PdC celle
   des j.h des cartes) ; ils entrent dans le **snapshot de capacité**
   (`CapacitySnapshot.coutsDemand`, facultatif) sur la carte du projet.
2. **Même axe que les métiers** : dans « Types de ressource », le centre de
   coût rejoint le métier de même libellé (rapprochement normalisé — casse,
   accents, espaces) ; un centre sans métier fait sa propre ligne. Deux
   colonnes de plus : **COUT PREV j.h** et **pression COUT PREV** (= COUT
   PREV / capacité), à côté du projeté PdC et de sa pression. KPI « Demande
   COUT PREV ». La ligne « capacité » du rapport dit le total et le nombre
   de lignes « Charge » retenues.
3. **Pas de capacité démontrée N-1** pour l'instant (choix de l'auteur : on
   regarde d'abord si la demande COUT PREV tient la route).

## Conséquences

- `adapters/csv-import/couts.ts` (`foldCharge`), `couts-stats.ts`
  (`CoutsCharge`), `registry.ts` (« Type de centre de coût », « Centre de
  coût » optionnels), `capacity.ts` (`collectCoutsDemand`, stats),
  `core/types.ts` (`CoutsDemand`), `core/capacity-metiers.ts` (clés
  normalisées, `coutsJh`, `coutsPressure`), `capacity-view.ts`
  (`kpis.coutsJh`), `front/components/capacityMetiers.tsx`, `CapacityView.tsx`.
- Sur les vraies données, l'écart PdC / COUT PREV par métier est
  l'information : il dit quel fichier ment, et pour quel type de ressource.
