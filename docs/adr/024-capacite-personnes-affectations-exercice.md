# ADR 024 — Capacité : personnes, affectations et année d'exercice

## Contexte

- Finalité de l'outil (auteur, 2026-09-07) : **soutenir les arbitrages
  inter-domaines** entre les responsables de domaines qui possèdent
  ensemble le portefeuille IT de la DSI. La sur-affectation des personnes,
  des équipes et des domaines est une aide directe à cet arbitrage ; le
  plan de charge (`Ressources_PdC`) porte déjà les affectations nominatives
  (matricule, ressource, projet, prévisionnel / réel de l'année) et l'onglet
  `Ress.Profils` — mis de côté en R9 — porte les personnes : domaine
  (Orga), métier, interne / externe, disponibilité.
- Le journal d'évènements est la vérité **des cartes**. Les personnes ne
  sont pas des cartes : elles n'ont ni flux ni âge à tracer ; l'import en
  donne une photo.
- Contraintes maintenues : les **noms n'entrent jamais dans le journal**
  (ids opaques seulement), l'email et le coût ne sont jamais lus ni
  stockés, aucune donnée client ne touche la machine de l'auteur (squelettes
  synthétiques uniquement, inventaire aveugle avant toute lecture).
- Le code des lecteurs portait l'année « 2026 » en dur (colonne du PdC,
  libellés du rapport) ; la clôture d'exercice est au programme de
  l'automne.

## Décision

1. **Table de faits `capacity`, hors journal.** `CapacitySnapshot
   { exerciseYear, persons[], assignments[] }` est **remplacée entière** à
   chaque import (`BoardStorage.importCapacity` / `getCapacity`). JSONL :
   un enregistrement `kind: "capacity"`, le dernier gagne ; PostgreSQL : table
   `capacity`, une ligne `current`, UPSERT. Ce n'est pas une entorse à
   l'event-sourcing : les cartes restent journalisées ; la capacité est une
   donnée de référence importée, sans mouvement à auditer.
2. **Année d'exercice dans la config** (`exercise.year`, défaut 2026). Le
   contrat du plan de charge est construit pour cette année
   (`pdcContract(year)`, registre `contractsFor(year)`), les libellés du
   rapport la citent. Changer d'exercice = changer la config et réimporter
   (préparation de la clôture de fin d'année, sprint suivant).
3. **`Ress.Profils` est lu** : contrat `ress_profils` — requis Nom de
   famille, Prénom, Métier, Disponibilité ; optionnels pk Contact, Id,
   Int/Ext, Domaine (Orga), Sous-domaine (Orga), Profil, Statut ; **Email et
   Coût déclarés ignorés**, jamais lus. Jointure PdC ↔ Profils par
   matricule (« Matricule » ↔ « Id » ou « pk Contact », normalisés). Une
   personne du PdC sans fiche devient un **stub** (nom, capacité inconnue),
   comptée et signalée ; rien n'est perdu en silence.
4. **Ids opaques** : `p-<fnv1a64(matricule normalisé)>`, stables d'un import
   à l'autre. Le matricule ne sort pas de l'exécution ; le nom est porté par
   la table capacité (affichage), jamais par `card_events`.
5. **Unité** : 200 j.h = 1 ETP (`ETP_JH`, `core/capacity.ts`). Une
   « Disponibilité » ≤ 5 est lue comme des ETP × 200 (signalé, unité à
   confirmer sur pièce — Q24) ; au-delà, des j.h.
6. **Domaines transverses** (`domains[].transverse` — A&D et INFRA) : leurs
   personnes servent tous les domaines. La lecture « domaine de la personne
   × domaine de la carte » (`demandByPersonDomain`) est la matrice
   d'arbitrage : elle dit à qui chaque domaine transverse consacre sa
   capacité.
7. **Fixtures** : générateur déterministe (`adapters/fixtures/capacity.ts`),
   personnes inventées, affectations qui retombent exactement sur les
   charges par profil des cartes ; le seed les enregistre.
8. **API** : `GET /api/capacity` → `{ capacity }` (null tant qu'aucun import
   ne l'a portée). Les calculs (charge par personne / équipe / domaine,
   surcharges, demande croisée) vivent dans `core/capacity.ts`, purs et
   testés ; le front n'en fera que l'affichage.

## Conséquences

- La vue capacité (sprint suivant) se construit sur des lectures pures du
  snapshot ; dès maintenant, le rapport d'import montre les chiffres (ligne
  « capacité » : personnes, externes, capacité, stubs, affectations,
  demande) pour vérifier que « les chiffres collent » avant toute UI.
- Un exercice = une config : plus d'année en dur dans les lecteurs ; le
  rapport, les contrats et les libellés suivent `exercise.year`.
- Une photo par import, sans historique de capacité (assumé ; si le besoin
  vient, journaliser les snapshots est un ajout, pas une refonte).
- La jointure par matricule dépend des colonnes Id / pk Contact du classeur ;
  les stubs rendent le manque visible plutôt que muet.
- Questions ouvertes pour le PMO : unité et fenêtre de « Disponibilité »
  (annuelle ou résiduelle ?), sens exact de Int/Ext, colonne portant le
  matricule joint (Id ou pk Contact).
