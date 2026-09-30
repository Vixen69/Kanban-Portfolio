# ADR 057 — Tout ce qu'une carte importée porte se saisit à la main

Date : 2026-09-30 · Statut : accepté · Précise l'ADR 012 (création locale) et l'ADR 022 (sous-domaines)

## Contexte

Règle de l'auteur : « quand tu crées un sujet à la main, soit à la page de
création, soit ensuite quand on l'édite, il faut pouvoir tout mettre…
autant d'informations que sur une carte qui a été importée ». L'audit de
parité du 30/09 montre l'inverse : « + Sujet » ne demandait que le nom, le
type, le domaine, la criticité et le chef de projet, et le serveur
**ignorait en silence** tout autre champ envoyé (réponse 201). Après
« Créer », rien ne s'ouvrait : il fallait retrouver la carte dans Demandes.
Le serveur inventait un code « PX » + 7 chiffres qui ressemblait à un vrai
code Sciforma. Plusieurs pièges de la fiche écrivaient des chiffres
inventés : un clic sur une enveloppe RDLI vide enregistrait l'estimation
affichée (estimé × 1,05), un champ vidé valait 0, le plan de charge tronquait
36,5 j.h en 36 et inventait le consommé d'un métier nouvellement coché.

## Décision

1. **Après « Créer », le formulaire « Modifier » de la nouvelle carte
   s'ouvre** : tout le reste se saisit dans la foulée.
2. **« + Sujet » gagne un bloc replié « Plus d'informations »** (fermé par
   défaut) : code projet, sous-domaine (si le domaine en déclare), meilleur
   estimé et consommé j.h, enveloppe RDLI, estimé, engagé et réalisé k€,
   date RDR, libellé du plan de charge, ressources clés — les mêmes champs
   que « Modifier », non dupliqués. Le serveur contrôle ces faits avec les
   **mêmes règles qu'une modification**. Une clé inconnue est refusée
   (400 en français) au lieu d'être ignorée. Restent refusés à la création :
   la colonne et la date d'entrée (tout sujet entre à gauche, aujourd'hui —
   règle du flux tiré), la nature (elle suit le canal), l'identifiant, la
   source et la référence Sciforma.
3. **Plus de code inventé** : sans code saisi, le code est vide.
4. **La fiche n'écrit que ce que l'on tape** : un clic suivi d'une sortie
   n'enregistre rien ; un montant non renseigné s'affiche « — » (la barre
   peut garder son estimation, jamais écrite) ; un champ vidé vaut « non
   renseigné », pas 0. Le plan de charge lit les décimales (virgule ou
   point) ; un métier coché commence à 0 consommé ; le consommé par métier
   se lit au centième.
5. **Contrôles serveur resserrés** : le sous-domaine doit appartenir au
   domaine de la carte ; la date RDR est un jour réel AAAA-MM-JJ, comme
   l'import l'écrit (les dates complètes déjà au journal restent lues) ;
   les champs personnalisés sont contrôlés contre la configuration (champ
   déclaré ; nombre, option de la liste, date, texte ≤ 500), une valeur
   déjà portée et inchangée passant telle quelle ; créer dans un exercice
   clos est refusé, comme l'import.
6. **Les longueurs maximales du serveur sont reportées dans les formulaires**
   (une seule source, `core/card-input.ts`) : une valeur trop longue ne peut
   plus faire échouer tout un enregistrement.
7. La fiche montre enfin, en lecture, les **ressources clés et les notes**.

## Conséquences

- Un client qui envoyait `nature` à la création reçoit désormais un 400
  (le front ne l'envoyait plus).
- Correction au passage : depuis l'ADR 040, une carte créée n'apparaissait
  qu'au rechargement de la page (sa ligne de base n'est pas dans le
  journal) ; un évènement `created` déclenche maintenant le rechargement
  complet.
- Hors périmètre, en attente de l'auteur : placer ou antidater une carte à
  la création, carte sans type, étiquettes / alertes / dépendances, capacité
  des cartes manuelles, priorité saisie vs réimport, adoption d'une carte
  manuelle par l'import.
- `core/card-input.ts` (+ tests), `middle/cards.ts`, `middle/validation.ts`,
  `middle/api.ts` (+ `cards.test.ts`), `front/cardFacts.ts` (+ tests),
  `front/detailModel.ts`, `QuickAdd`, `CardEdit`, `CardDetail`,
  `DetailSections`, `DetailPlan`, `DetailRisk`, `modalEditors`,
  `modalParts`, `App`, `useBoardStore`, `api.ts`.
