# ADR 033 — Types de ressource par métier, charge « à pourvoir », personnes en tension

Date : 2026-09-11 · Statut : accepté (décision de l'auteur)

## Contexte

La vue ☷ (ADR 024/025/028/029) lit la capacité par personne nommée. Deux
manques relevés par l'auteur face à la macro « Consolidation PDSI » d'un
collègue (docs/CAPACITE-MACRO-PDSI.md) : la charge **sans personne nommée**
(affectations génériques, codes « zz », rôles « PE22 ») était comptée à
part et portée nulle part ; et la lecture par **type de ressource** — l'unité
de la macro — n'existait pas. Sur les vraies données, le « Métier » du plan
de charge prend vingt valeurs (CdP INFRA BUILD, Concept.Dév., Pilote de
service, PMO…) : c'est exactement le type de ressource, nominatif et
générique confondus. La capacité, elle, n'est pas un ETP forfaitaire :
« ça dépend des personnes », c'est la ligne « Disponible ressource » de
chacune (auteur).

## Décision

1. **La demande générique entre dans le snapshot**, par métier
   (`CapacitySnapshot.generic` : métier, domaine via l'organisation, carte
   du tableau quand le projet en a rejoint une, j.h). Le lecteur du PdC
   agrège les lignes non nominatives par (projet, métier, organisation).
   Facultatif dans le snapshot stocké : les anciens se lisent sans.
2. **Types de ressource = métiers du plan de charge** (`loadByMetier`) :
   par métier, personnes, capacité déclarée (lignes « Disponible »),
   projeté (tout le plan de charge), part du tableau, **à pourvoir**
   (générique, dont la part sur le tableau), **pression** = (projeté + à
   pourvoir) / capacité, libre / surcharge. Nouveau panneau large « Types
   de ressource », nouveau KPI « À pourvoir ». Les `profiles` de la config
   restent le vocabulaire des cartes ; le métier brut est celui du fichier.
3. **Personnes en tension, en entier.** Le panneau liste **toutes** les
   personnes au niveau ≥ seuil de tension (`capacity.tension`, nouveau champ
   de config, 0,9 par défaut), les plus chargées d'abord, rouge au-delà de
   100 %, avec leur **métier** et leur domaine ; un cumul par métier en tête
   (« CdP INFRA BUILD 4/7 · 2 > 100 % ») dit quels rôles saturent.
4. **Pas d'ETP forfaitaire** dans la lecture : la capacité de chaque
   personne est sa ligne « Disponible ». `ETP_JH` ne sert plus qu'au repli
   Ress.Profils (disponibilité en ETP) et aux fixtures.

5. **Cartes qui pèsent sur les transverses** (précision de l'auteur, même
   nuit) : toute carte, quel que soit son portefeuille, qui prend des jours
   aux ressources du domaine transverse — ses personnes nommées **et** ses
   lignes génériques — rapportés à la capacité totale du domaine. Liste
   entière, les plus lourdes d'abord ; part générique dite.

6. **Préfixes fusionnés** (auteur, 2026-09-12, sur les vraies données) :
   les centres de coût COUT PREV arrivent préfixés « NEXTER.CdP IT4IT »,
   certains métiers du PdC « Externe.Concept.Dév. ». Un libellé « X.Y »
   rejoint la ligne « Y » dès que « Y » est un libellé connu du snapshot
   (règle guidée par les données : « Concept.Dév. ERP », sans reste connu,
   reste entier). L'affichage garde l'orthographe sans préfixe.

## Conséquences

- `core/capacity-metiers.ts` (nouveau), `capacity-levers.ts` (seuil,
  `over`), `capacity-view.ts` (`metiers`, `tensionByMetier`, `tension`,
  `kpis.genericJh`), `config-types.ts` / `config.ts` (`capacity.tension`),
  `adapters/csv-import/pdc-lines.ts` (`recordExcluded`, `PdcGeneric`),
  `pdc.ts`, `capacity.ts` (`collectGeneric`), `front/components/
  capacityMetiers.tsx`, `capacityPanels.tsx`, `CapacityView.tsx`.
- Non fait, ouvert : la capacité **démontrée** (Réel N-1 du PdC par
  personne et par métier) comme second repère quand « Disponible »
  manque ; l'appel de charges COUT PREV par centre de coût en recoupement
  (ses charges sont dites pas à jour par l'auteur).
