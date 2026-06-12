# ADR 006 — Alignement sur la maquette : modèle étendu, clic en deux temps

## Contexte

La maquette de référence (`design/`) porte un vocabulaire produit plus
riche que le modèle de données du contrat (CLAUDE.md §4) : criticité
(★ Top / Major / Normal), type de projet, code projet (PX…), nature par
canal, fiche détaillée de carte, recherche. Le PO a demandé l'alignement
sur la maquette ; le contrat est en retard sur ce vocabulaire.

## Décision

- **Le modèle `cards` est étendu** de trois champs : `criticality`
  (top/major/normal, vocabulaire fixe câblé), `type_id` (référence au
  vocabulaire `types` de la configuration), `codename` (code projet,
  recherchable, masquable). ⚠️ **CLAUDE.md §4 doit être amendé** pour
  refléter ces colonnes (et la table SQLite du Sprint 3 les portera).
- **La configuration s'étend** (topologie/vocabulaire uniquement) :
  `types: [{id, name, short}]` (optionnel) et `nature` optionnelle par
  canal. La nature d'une carte est **dérivée de son canal** — pas de
  champ carte.
- **Clic en deux temps** (P5 de la maquette) : premier clic sur une carte
  → focus de sa cellule ; second clic → fiche détaillée. La fiche est une
  projection en lecture (titre, code, étiquettes, responsable, âge,
  budget, dépendances, **historique depuis le journal d'événements**) ;
  ses deux seules actions — signaler / lever un blocage — écrivent des
  événements `blocked` / `unblocked`, jamais de mutation.
- **Panneau latéral complet** : recherche (titre + code, touche `/`),
  interrupteur « Codes projet », filtres Type / Nature / Criticité /
  Domaine (tout/rien) en plus de Responsable / Bloqués / Âge,
  statistiques sélection·total étendues (criticités, natures).

## Reste volontairement hors périmètre (décision PO requise)

Commentaires, ressources clés, plan de charge, charge en jours-homme,
édition complète de la fiche (événements `edited`), création locale
(« + Sujet » : en conflit avec l'énumération `source` et l'architecture
de synchronisation), notes, référence Sciforma sur la fiche, gates
DoR/DoD. Chacun exige une extension du modèle ou une décision produit.

## Conséquences

- Les adaptateurs réels (csv, Sciforma) devront fournir ou laisser nuls
  criticité, type et code (mapping à confirmer, §12).
- Le critère « un écran » est inchangé (les marqueurs vivent dans la
  hauteur de barre existante).
