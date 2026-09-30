# ADR 061 — Pas de domaine par défaut, jamais

Date : 2026-09-30 · Statut : proposé (branche import-lisible) · Amende les
ADR 036 (domaine arbitré) et 055 (rapport lisible)

## Contexte

L'auteur, le 30 septembre : « un nouveau projet où le portefeuille n'a
aucun domaine, ça ne devrait pas aller à A&D par défaut, c'est une grosse
connerie, il ne faut surtout pas faire ça… normalement il y a toujours un
domaine, le seul moment où ce n'est pas évident c'est les projets vendus…
s'il n'y a pas de domaine, il faut que ce soit manuellement assignable, et
tu me le signales avec un truc sur la carte ».

Jusqu'ici, un projet dont l'export ne résolvait aucun domaine tombait dans
le premier domaine du modèle (A&D). L'ADR 055 le disait dans le rapport,
mais la carte, elle, était rangée chez A&D : elle pesait dans ses filtres,
sa couleur, ses chiffres et dans l'arbitrage des responsables de domaine.

## Décision

1. **Aucun domaine par défaut.** Un nouveau projet sans domaine résolu entre
   au tableau **sans domaine** (domaine vide). Le rapport d'import le dit :
   « domaine non résolu — à attribuer à la main ». Les marqueurs de nom
   (« [Business] »), la sécurité « PROJETS VENDUS » et les conflits de
   l'ADR 036 ne changent pas.
2. **Les anciennes cartes rangées par défaut deviennent visibles.** Quand
   l'export ne donne pas de domaine pour une carte déjà au tableau, rangée
   dans le premier domaine du modèle (A&D, le seul que l'ancienne règle
   donnait — une carte d'un autre domaine le tient d'un export), et
   qu'aucun humain n'a jamais fixé son domaine (ni modification dans la
   fiche, ni décision « garder » / « remplacer » de l'ADR 036, ni création à
   la main), le chargement la marque **« domaine à vérifier »** : son
   domaine est peut-être l'ancien A&D par défaut. La marque est recalculée
   à chaque chargement ; un domaine choisi à la main l'efface aussitôt. Le
   rapport d'import liste ces cartes (« Domaine à vérifier — l'export n'en
   donne pas »).
3. **Une carte sans domaine prend celui de l'export dès qu'il le donne** :
   il n'y a rien à garder, donc pas de conflit à arbitrer. Il en va de même
   d'une carte dont le domaine n'existe plus dans le modèle (le tableau la
   montre déjà « Sans domaine ») : elle prend le domaine de l'export, sans
   conflit, même si un « garder » avait été noté ; elle n'est jamais
   marquée « à vérifier ». Dans « Modifier », choisir seulement le
   sous-domaine confirme aussi le domaine : la marque s'efface.
4. **Le signal sur la carte** : un petit « ? » fixe (rien ne bouge, ADR
   051), plein pour « Domaine à attribuer », en contour pour « Domaine à
   vérifier », sur la barre du radiateur, sur la carte en focus et dans la
   fiche. Le lavis rouge reste au seul blocage (un signal par information).
   La carte sans domaine porte le gris neutre.
5. **Attribuer à la main** : dans la fiche, un bandeau dit le problème et
   propose le domaine (et le sous-domaine quand il existe) ; « Attribuer »,
   ou « Confirmer ce domaine » pour une carte à vérifier. C'est une
   modification ordinaire, tracée dans le journal. On attribue, on ne
   désattribue jamais : le serveur refuse un domaine vide ou inconnu.
   « Modifier » propose « — à attribuer — » tant que la carte n'en a pas.
   « + Sujet » n'en présélectionne plus aucun : « Créer » attend qu'on le
   choisisse.
6. **Partout où un domaine est lu**, une carte sans domaine se lit « Sans
   domaine » : filtres (une pastille « Sans domaine », allumée par défaut,
   avec son compte ; « tout · rien » l'incluent), vue Capacité, archives,
   rapport d'import et « Comparer avec maintenant ». Un domaine que le
   modèle ne connaît plus se lit aussi « Sans domaine » au lieu d'être
   affiché sous le premier domaine. Dans la section Blocage de la barre
   latérale, à côté de « Bloqués uniquement », une pastille « Domaine à vérifier » (avec son compte, visible
   seulement s'il y a des cartes concernées) montre d'un clic toutes les
   cartes sans domaine ou à vérifier.

## Conséquences

- Plus aucune carte n'est rangée chez A&D sans qu'on le sache ; le PMO voit
  d'un coup d'œil ce qui reste à attribuer.
- Au premier chargement après la mise à jour, des cartes au domaine juste
  peuvent être marquées « à vérifier » (l'export ne le donne plus et
  personne ne l'avait confirmé) : un clic sur « Confirmer ce domaine » suffit.
- Les cartes et journaux existants se relisent sans migration : le champ
  « domaine à vérifier » est facultatif, absent partout ailleurs.
- Fichiers : `core/domain-check.ts`, `core/filter-counts.ts`,
  `core/filters.ts`, `core/state.ts`, `core/config-derive.ts`,
  `core/types.ts`, `core/capacity-levers.ts`, `core/capacity-view.ts`,
  `adapters/csv-import/` (`card-row.ts`, `to-cards.ts`, `board-reading.ts`,
  `domain-conflicts.ts`, `import-changes.ts`), `middle/validation.ts`,
  `sync/import-text.ts`, `front/domainMark.ts`,
  `front/components/DomainAssign.tsx` et les vues qui lisent un domaine, et
  leurs tests.
