# ADR 026 — Décision tracée sur la carte, sujets absents du dernier import, clôture d'exercice

## Contexte

- Référentiel V3.1 : six décisions par sujet (D1 faire entrer, D2
  continuer, D3 réduire, D4 mettre en pause, D5 requalifier, D6 stopper) ;
  D4/D5/D6 sont **tracées avec leur raison** dans les termes de la grille
  d'arbitrage (PROTÉGER / METTRE EN PAUSE) ; règle 7.8 : toute décision
  tracée, retrouvable par sujet, « non tracée = non prise ». Le journal
  portait les mouvements, pas les raisons.
- Backlog de l'auteur (2026-09-07) : décision sur la carte (point 2,
  d'abord pensée comme un modèle séparé, « à intégrer ensuite comme
  évènement du journal ») ; « rien n'est écrasé » et fin d'année (point 6,
  « très important ») : le ré-import ne doit jamais supprimer une carte
  absente du nouveau fichier, et l'année d'exercice doit pouvoir changer.
- Mode autonome accordé le 2026-09-08 (« go S3 S4 ») : les choix ci-dessous
  sont ceux de Claude, à contester à la revue.

## Décision

1. **La décision est un évènement du journal**, type `decided`, charge utile
   `{ decisionId, grounds[], reason, reviewDate }`. Le vocabulaire vit dans
   la config : `decisions` (id, nom, code court, couleur, `traced`) et
   `decisionGrounds` (les termes de la grille, famille `proteger` ou
   `pause`) ; les deux listes prennent par défaut celles du référentiel
   quand une config antérieure ne les porte pas. Le middle refuse une
   décision `traced` sans raison (ni terme de la grille, ni texte), une
   décision ou un terme inconnus, une date de réexamen qui n'est pas un jour
   ISO, et toute décision sur une carte archivée.
2. **Aucun déplacement automatique** : une D4 ne pousse pas la carte en
   Pause. La position reste le geste du responsable (nature positionnelle,
   ADR 018) ; la décision dit pourquoi, le tableau dit où. Les deux se
   lisent ensemble dans la fiche (section « Décision », historique) et sur
   le ticket (pastille D-code, cerclée de rouge quand la date de réexamen
   est dépassée). La barre latérale compte les « réexamens dépassés ».
3. **Sujets absents du dernier import** : le chargement (`--charger`)
   n'efface jamais une carte. Une carte importée (`source: "csv"`), non
   archivée, absente du nouveau périmètre reçoit un évènement `unlisted`
   (acteur `import-csv`) ; quand elle revient, un `relisted`. Le fold porte
   `absentFromLastImport` (date de l'import qui l'a manquée). Le ticket
   porte un marqueur « ∅ », la fiche un bandeau, la barre latérale un
   compte. Les cartes créées à la main ne sont jamais marquées.
4. **Clôture d'exercice** : un outil de ligne de commande, `node
   sync/cloture.ts`, simulation par défaut ; `--appliquer` archive les
   sujets des étapes terminales (dérivées de la config, ou `--colonnes`)
   par des évènements `archived` (acteur `cloture-<année>`, réversibles
   depuis la vue Archives) ; `--annee` écrit l'année suivante dans la
   config d'exécution (historique append-only, ADR 013). L'étape suivante
   est l'import des fichiers du nouvel exercice : le contrat du plan de
   charge et les libellés du rapport suivent `exercise.year` (plus aucun
   « 2026 » en dur dans les lecteurs ni dans le rapport).
5. Les fixtures portent quelques décisions synthétiques (D4 sur tout sujet
   en Pause, D2/D3/D5 sur quelques sujets en flux, certaines échéances
   dépassées) pour que la fiche et le tableau aient quelque chose à montrer.

## Conséquences

- Le journal devient la trace de la RSP et de la Synchro : chaque décision
  est retrouvable par sujet (historique), avec sa raison et son échéance.
- Une décision se corrige par une nouvelle décision, jamais par une
  modification (append-only).
- Le marquage « absente » rend visible ce que le nouvel export ne porte
  plus, sans rien perdre ; c'est au responsable d'archiver ou de garder.
- La clôture est un geste explicite et outillé, pas un automatisme du
  1er janvier ; son mode simulation permet de la répéter sans risque.
- À revoir avec les utilisateurs : la liste des termes de la grille,
  l'opportunité d'un filtre « décision » dans la barre latérale, et le
  rôle autorisé à tracer quand l'authentification arrivera (RP3).
