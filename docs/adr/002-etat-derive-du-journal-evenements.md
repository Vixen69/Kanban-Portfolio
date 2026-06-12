# ADR 002 — L'état du tableau est dérivé du journal d'événements

## Contexte

Le contrat fait du journal `card_events` (append-only) la vérité : piste
d'audit pour la revue de sécurité ET source unique des métriques de flux.
Le vieillissement d'une carte dépend du temps passé dans sa colonne, donc
d'un historique de mouvements.

## Décision

- `core/events.ts` fournit un magasin **append-only** en mémoire
  (`InMemoryEventStore`) : append, list, subscribe. Aucune méthode de
  mise à jour ni de suppression n'existe (vérifié par test).
- `core/state.ts` **replie** (fold) le journal sur les cartes importées :
  position (colonne, canal), état bloqué, et `enteredColumnAt` (qui pilote
  le vieillissement) sont calculés depuis les événements, jamais stockés.
- L'UI n'effectue **aucune mutation** : un déplacement appende un événement
  `moved` (acteur + horodatage), puis l'état est re-dérivé.
- L'adaptateur `fixtures` génère un historique rétro-daté plausible
  (created + moved + blocked) pour que vieillissement et futures métriques
  s'exercent sur le même chemin que les données réelles. Les adaptateurs
  réels ne fabriqueront jamais d'historique : leurs imports SONT
  l'historique.
- Le schéma de l'événement reproduit la table `card_events` du contrat
  (id, ts, actor, card_id, type, from_column, to_column, payload) ; les
  canaux source/cible voyagent dans `payload` (le schéma SQL ne prévoit
  que les colonnes en champs de premier rang).

## Conséquences

- Le Sprint 3 remplace le magasin mémoire par SQLite **sans changer le
  modèle** : même schéma, même fold.
- Les métriques du Sprint 6 (cycle time, throughput, temps par colonne)
  seront des requêtes sur les événements — aucun magasin de métriques
  séparé ne sera créé.
- Rejouer le journal est O(n événements) à chaque écriture ; trivial à
  l'échelle d'un portefeuille (≈10² cartes, ≈10³ événements), et le point
  d'optimisation est connu si besoin (fold incrémental).
