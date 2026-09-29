# ADR 051 — Passe de perf pour la VM sans carte graphique : plus rien ne bouge

Date : 2026-09-29 · Statut : accepté (demande de l'auteur : « au pire, fais
péter les animes », « des vraies passes de performance ») · Amende l'ADR 050
(point 4), le §1 et le §5 de CLAUDE.md

## Contexte

Après essai, l'auteur trouve l'outil « un peu plus lent qu'avant ». La VM
du client n'a **pas de carte graphique** et on y accède par **Guacamole** :
le navigateur dessine tout au processeur, et chaque image modifiée est
encodée puis renvoyée sur un réseau médiocre. Elle héberge aussi nginx, le
middle et PostgreSQL.

On a mesuré avant de toucher au code : un Chrome lancé **sans carte
graphique** (`--disable-gpu --disable-gpu-compositing`), à 1920x1080 avec
les 154 cartes, et un banc navigateur sur le build de production ; la
version d'avant l'ADR 048 (dc781df) a été mesurée de la même façon.

- **Le calcul n'a pas régressé** : 10 à 50 ms de JavaScript et de mise en
  page par geste, dans le bruit face à dc781df. Le cœur coûte moins d'1 ms
  par geste ; le serveur répond en 2 à 6 ms.
- **Le dessin, si** :
  - le **flou derrière la fiche** (`backdrop-filter: blur(2px)` plein
    écran) coûte environ 60 ms par image dès qu'un pixel bouge sous la
    fiche ou dedans (curseur de saisie, ← →) : 70 à 85 ms par image avec,
    18 à 22 ms sans ;
  - flou et **point de blocage pulsant** réunis dans une fiche occupent un
    cœur de processeur entier (14 images/s) ;
  - la **transition de la grille** (200 ms sur `grid-template-columns`)
    transforme un clic d'en-tête ou de Σ en 11 à 14 mises en page du
    tableau entier et plus de 3 000 opérations de dessin (218 ms de
    tramage) ; sans elle : une mise en page, 21 ms de tramage ;
  - la **flèche de défilement** oscillait sans fin dans chaque case qui
    déborde (4 aujourd'hui), avec une ombre portée recalculée à chaque
    image : l'écran ne cessait jamais de changer, donc Guacamole de
    transmettre.

## Décisions

1. **Plus rien ne bouge.** Aucune animation, aucune transition : grille,
   flèche de défilement (fixe, sans ombre portée), point de blocage (fixe),
   interrupteurs, édition en place. Le cadre de 4 s du dernier dépôt
   (ADR 050) apparaît et disparaît sans fondu, il reste.
2. **Plus de flou d'arrière-plan** : le voile sombre de la fiche et du
   message « aucun sujet » reste, sans `backdrop-filter`.
3. **Connexions PostgreSQL gardées 30 min** : `pg` fermait une connexion
   inactive après 10 s, donc chaque geste d'une séance (à quelques minutes
   d'intervalle) rouvrait une connexion avec son authentification.
4. **Correctif trouvé en chemin** : dans une colonne sans canal
   (Demandes, Qualification — ADR 039), déposer une carte SUR une carte
   d'un autre canal était refusé (« Carte cible de l'insertion hors de la
   cellule visée »). La colonne entière est une seule case : le serveur
   n'exige plus le même canal (test ajouté).
5. **Moins de rendu React pour rien** (mêmes pixels, vérifié carte par
   carte) :
   - les petites cartes lisent l'horloge au jour (leur âge en jours) et non
     plus à la minute : le tic de chaque minute ne redessine plus les 154
     cartes ;
   - elles ne reçoivent plus le tri ni la loupe, qui ne servent qu'à la
     carte dépliée : cocher un métier ne les redessine plus ;
   - les index domaine / type ne sont plus reconstruits trois fois par
     carte et par rendu ;
   - le survol pendant un glisser vit hors de l'état de l'application
     (`front/dragHover.ts`, `useSyncExternalStore` de React) : chaque carte
     survolée redessinait ~220 composants, seulement les cases concernées
     désormais (13) — la marque de dépôt ne traîne plus derrière la souris
     sur un processeur lent.

## Conséquences

- `front/styles/board.css`, `cards.css`, `modal.css`, `sidebar.css`,
  `metrics.css` ; `middle/storage/postgres.ts` ; `middle/api.ts` (+ test) ;
  `front/components/cards.tsx`, `Cell.tsx`, `BoardGrid.tsx`,
  `UnifiedZone.tsx`, `front/App.tsx`, `useInteractions.ts`, `lookup.ts`,
  `front/dragHover.ts` (+ test).
- Aucun changement de modèle ni de données ; à l'écran, seuls le flou et le
  mouvement disparaissent. Au clic sur un en-tête, la colonne s'élargit
  d'un coup.
- La branche `proposition-design` n'avait déjà plus de flou ; en revanche
  elle ajoute ombres et coins arrondis sur les 154 cartes, coûteux à
  dessiner sans carte graphique : à revoir avant de l'adopter.
- Écarté : l'alerte sur « localhost » (Windows tente l'IPv6 avant l'IPv4,
  jusqu'à 300 ms par requête en local) — sans objet sur la VM, dont le
  réseau n'a pas d'IPv6.
