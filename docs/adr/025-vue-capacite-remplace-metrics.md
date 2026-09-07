# ADR 025 — La vue ☷ devient la vue capacité (remplace la lecture Metrics v12)

## Contexte

- La vue « Metrics » (design v12, ADR 020) était, de l'aveu de l'auteur,
  un espace réservé « porté par zéro vision design » : six indicateurs et
  sept panneaux de gouvernance sans usage identifié.
- La finalité de l'outil est l'**arbitrage inter-domaines** entre les
  responsables de domaines (2026-09-07) ; la matière qui l'éclaire est la
  capacité — qui consomme les personnes des domaines transverses, quel
  domaine et quelle compétence dépassent leurs moyens, quelles cartes
  pèsent, qui est au-delà de 100 %. Ces données existent depuis l'ADR 024.
- Décisions de l'auteur (2026-09-07) : la vue capacité **remplace** Metrics
  (pas d'onglet, pas de section) ; les **noms** des personnes en surcharge
  sont affichés d'emblée (pas d'authentification à ce stade — accès réglé
  par le réseau, posture §6) ; lecture **annuelle** (prévisionnel de
  l'exercice contre capacité déclarée), le « reste à faire contre capacité
  restante » attend la réponse du PMO sur la fenêtre de « Disponibilité »
  (Q24).

## Décision

1. Le bouton ☷ ouvre la **vue Capacité** : six chiffres de tête (capacité
   déclarée, demande prévisionnelle, charge globale, personnes au-delà de
   100 %, cartes sans affectation, réalisé indicatif), puis six panneaux —
   **demande sur les domaines transverses** (matrice domaine transverse ×
   domaine demandeur, j.h et part de la capacité), charge par domaine,
   charge par profil, **cartes qui pèsent** sur chaque transverse (cinq par
   domaine), personnes au-delà de 100 %, **couverture des chiffres**
   (cartes sans affectation, charge générique non nominative, personnes
   sans fiche, capacités inconnues, affectations hors tableau).
2. Tous les chiffres viennent de `core/capacity-view.ts` (pur, testé) sur
   `core/capacity.ts` ; la vue se contente de formater (fr-FR) et de tracer
   des barres honnêtes (demande sur capacité, plafonnée à 100 %, rouge
   au-delà). Le snapshot est lu à l'ouverture de la vue (`GET
   /api/capacity`), pas à chaque action : il ne change qu'à l'import.
3. Les composants `MetricsView` / `metricsPanels` sont **supprimés**. Les
   calculs `core/metrics.ts` et `core/metrics-flow.ts` (flux, encours,
   blocages, budget croisé) restent dans le cœur avec leurs tests : purs,
   sans coût, disponibles si une lecture de flux revient (le flux « éclaire,
   ne décide pas », référentiel V3.1).
4. Ce que la vue n'affiche pas, par décision : conversions en ETP partout
   (le taux suffit), historique de capacité (une photo par import),
   croisements avec le flux.

## Conséquences

- Le panneau ☷ porte enfin un contenu tourné vers l'usage : préparer la
  RSP et les arbitrages entre responsables de domaines.
- Une partie de l'ADR 020 (la lecture de gouvernance) est retirée de
  l'interface ; les totaux d'agrégats des en-têtes (Σ) restent.
- Les noms affichés dans la vue n'entrent toujours pas dans le journal
  (ADR 024) ; quand l'authentification arrivera (RP3), la liste nominative
  pourra être réservée aux rôles PMO/admin sans changer le cœur.
- À revoir avec la réponse Q24 : une seconde lecture « reste à faire
  contre capacité restante » ; et avec la clôture d'exercice (S3) : le
  changement d'année dans les libellés.
