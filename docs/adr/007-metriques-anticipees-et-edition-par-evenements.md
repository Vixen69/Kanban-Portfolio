# ADR 007 — Métriques de flux anticipées, édition par événements

## Contexte

La maquette comporte deux panneaux supplémentaires : la vue « Métriques
de flux » (☷) et le mode édition de la fiche de carte. Le contrat planifie
les métriques au Sprint 6 et impose qu'elles soient « des requêtes sur
les événements » ; le type d'événement `edited` existe dans le schéma
`card_events` (§4) mais n'était pas exploité.

## Décision

- **Métriques (Sprint 6 tiré en avant).** `core/metrics.ts` calcule tout
  depuis le journal et les états qui en dérivent : flux par étape (avec
  alerte WIP), temps moyen par étape (séjours TERMINÉS uniquement —
  paires d'entrées consécutives par carte), composition d'âge par paliers
  de `agingStepsDays`, blocages par étape, charge budgétaire par canal
  (k€), livrés et goulot. Aucun magasin de métriques : des requêtes.
  - Heuristique assumée : les **deux dernières colonnes** sont
    « terminales » (livré / en production) — exclues du calcul de goulot,
    comptées comme livrées. À revoir si la topologie change de sens.
  - Vue plein écran `M` / ☷, fermée par `Échap` (déroulé : métriques,
    fiche, focus, panneau).
- **Édition par événements.** « Modifier » dans la fiche émet UN
  événement `edited` portant un correctif (`patch`) **liste blanche** :
  titre, responsable, domaine, criticité, type, code, tags, budget,
  consommé, restant. Le repli (fold) applique le correctif champ par
  champ avec validation de type ; tout champ hors liste (id, position,
  blocage, dates, source) est ignoré silencieusement — un événement
  historique corrompu ne peut pas casser l'état. Position et blocage
  gardent leurs événements dédiés.
- Le `payload` des événements `edited` contient donc des valeurs métier
  (titres, budgets) : `card_events` est la piste d'audit, pas un journal
  de diagnostic — la règle « pas de titres ni de montants dans les logs »
  (§6) vise les journaux applicatifs, pas la table d'audit. Interprétation
  à confirmer avec l'officier de sécurité.

## Refusé : le panneau d'administration de la maquette

La maquette comporte un panneau ⚙ d'édition de la topologie (canaux,
colonnes, domaines, types). Le contrat l'interdit explicitement :
« Topology lives in a versioned config file. **There is no settings
UI.** » (§1, contraintes permanentes). La topologie se change en éditant
`config/board.json` dans git. Construire ce panneau exige d'amender le
contrat — décision PO, non prise ici.

## Conséquences

- Le Sprint 6 se réduira à enrichir cette vue (cycle time complet,
  throughput par période) — le socle « requêtes sur événements » est posé.
- Les éditions sont auditées une par une (acteur, horodatage, correctif).
