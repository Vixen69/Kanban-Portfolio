# Idées de finition et d'accessibilité

Date : 2026-09-29 · Statut : **liste de propositions**, rien n'est codé.
Classées par (effet « waouh » + valeur en séance d'arbitrage) / effort.
Chaque ligne dit si elle touche une règle du produit (CLAUDE.md).

Composants déjà autorisés par le plafond du client, si besoin : `lucide-react`
(icônes), `sonner` (notifications), `@radix-ui/react-tooltip` (infobulles).

## 1. Mode séance (touche P)

*séance · effort faible*

- **Quoi** : P met le tableau « en scène » : plein écran du navigateur (API Fullscreen), barre latérale fermée, « + Sujet » et engrenage masqués, curseur caché après 2 s d'immobilité, chiffres clés au palier SALLE de la v13, pastille « Séance ✕ » pour sortir.
- **Pourquoi** : L'opérateur ne manipule plus l'outil devant douze responsables de domaine, et le plein écran rend les 80 à 120 px mangés par la barre d'adresse, soit la marge qui protège le « un écran, zéro défilement ».
- **Règle** : Aucun si c'est un état de session (rien dans localStorage, sinon un 4e drapeau à valider) et si la bascule est nette, sans fondu. Le navigateur consomme le premier Échap du plein écran : il faut l'articuler avec la pile d'Échap existante.

## 2. Dernier geste signalé

*accessibilité · effort très faible*

- **Quoi** : Après chaque écriture (déplacement, blocage, décision), la carte touchée garde un contour d'encre statique de 2 px jusqu'au geste suivant, et une région aria-live dit « PE-041 : Prêts → Actifs, 5/4 limite dépassée ».
- **Pourquoi** : Sur un mur de 150 barres, la salle ne voit pas quelle carte vient de bouger ; aujourd'hui un glisser-déposer est aussi totalement muet pour un lecteur d'écran.
- **Règle** : Aucun si le contour reste statique : un fondu de disparition serait une animation, à faire valider par l'auteur.

## 3. Enchaîner les fiches ( ] et [ )

*clavier · effort faible*

- **Quoi** : Fiche ouverte, ] et [ passent au sujet suivant ou précédent dans l'ordre exact du tableau (tri ADR 044, loupe ADR 048 et filtres compris), avec un repère « 7 / 23 · Études/Cadrage » en haut de la fiche.
- **Pourquoi** : L'arbitrage déroule les sujets un par un : l'animateur les enchaîne comme des diapositives au lieu de fermer, viser une barre de 16 px et recliquer devant la salle.
- **Règle** : Aucun ; la « dernière fiche » éventuelle reste en mémoire vive, jamais en localStorage (ADR 020).

## 4. Aide-mémoire « ? »

*clavier · effort très faible*

- **Quoi** : La touche ? ouvre une carte de tous les raccourcis groupés (Tableau, Fiche, Filtres, Séance) en pastilles <kbd>, et les infobulles des boutons citent leur touche (« Filtres  S », « + Sujet  N »).
- **Pourquoi** : Les raccourcis / N S Échap existent déjà mais personne ne peut les découvrir ; c'est aussi le support de formation de l'équipe PMO avant la RSP.
- **Règle** : Aucun (surcouche, zéro hauteur). Option à trancher : un interrupteur qui fait passer S et N en Alt+S / Alt+N (WCAG 2.1.4) demanderait un 4e drapeau localStorage s'il doit être mémorisé.

## 5. Décision éclair

*journal · effort faible*

- **Quoi** : Fiche ouverte, les touches 1 à 6 présélectionnent D1–D6, les motifs de la grille se cochent aux flèches, l'échéance se choisit par préréglage (« Synchro suivante », « RSP suivante »), et un récapitulatif s'affiche avant Ctrl+Entrée, qui écrit l'événement decided.
- **Pourquoi** : « Non tracée = non prise » (7.8) : tracer en cinq secondes au clavier, pendant que la salle parle encore, évite que les décisions soient reconstituées de mémoire après la séance.
- **Règle** : Aucun sur l'écriture (même événement decided). Pas d'« annuler » par suppression, puisque le journal est append-only : une erreur se corrige par une nouvelle décision.

## 6. Rideau (touche B)

*séance · effort très faible*

- **Quoi** : En mode séance, B remplace instantanément l'écran par un aplat neutre titré (« RSP · 1er octobre · contrainte : Infra ») pendant que l'opérateur règle filtres, loupe ou Analytics derrière ; B de nouveau révèle le résultat.
- **Pourquoi** : La salle ne voit jamais les tâtonnements, seulement la réponse ; c'est aussi un écran d'accueil propre, et un cache immédiat si quelqu'un entre pendant que des données défense sont projetées.
- **Règle** : Aucun si le rideau tombe sans fondu (un fondu est une animation, à faire valider).

## 7. Recherche sans accents, qui surligne

*polish · effort faible*

- **Quoi** : La recherche ignore les accents (normalisation NFD dans core/filters.ts, qui fait aujourd'hui un simple toLowerCase().includes, lignes 217-221), surligne la partie trouvée dans les barres restantes, et Entrée ouvre la fiche quand il ne reste qu'une carte.
- **Pourquoi** : En séance, on tape vite « securite » ou « etudes » et on ne trouve pas « Sécurité » : c'est un vrai défaut pour une interface entièrement en français.
- **Règle** : Aucun ; le changement touche core/, donc les tests se mettent à jour dans la même session.

## 8. Favicon et titre d'onglet vivant

*polish · effort très faible*

- **Quoi** : Un /favicon.svg à l'encre du produit (front/public ne contient aujourd'hui que les polices) et un titre d'onglet qui suit le contexte : « PE-041 · Nom — 2026 · Portfolio Kanban DSI », « 2027 (préparation) · … ».
- **Pourquoi** : Sur un portable à vingt onglets, on retrouve l'outil et la fiche ouverte au premier coup d'œil ; c'est le détail le moins cher de la liste, et son absence se remarque.
- **Règle** : Aucun (fichier servi sur place ; aucun chiffre financier dans le titre).

## 9. Palette de commandes (Ctrl+K)

*clavier · effort moyen*

- **Quoi** : Un champ unique au centre trouve une carte par nom ou code (Entrée ouvre la fiche) et lance les commandes existantes : loupe « A&D », « Focus Actifs », « Bloqués », « Analytics › Capacité », « Exercice 2027 », « Instantané », chaque ligne affichant son raccourci.
- **Pourquoi** : « Et le projet X ? » reçoit sa réponse en deux secondes sans fouiller la barre latérale devant la salle, et c'est le geste qui signe un logiciel moderne.
- **Règle** : Aucun si elle est écrite à la main sur le modèle combobox ARIA (cmdk est hors SBOM). Elle change l'exercice affiché, jamais la bascule d'année, qui reste admin et confirmée.

## 10. Depuis la dernière séance

*journal · effort moyen*

- **Quoi** : Un filtre « Changés depuis… » ancré sur un instantané (son logSeq, ADR 042) ne garde que les sujets entrés dans une étape, bloqués ou débloqués, décidés ou créés depuis, avec une pastille « Depuis RSP 01/07 : 14 sujets ✕ » ; les réordonnancements dans une case et les événements défaits par une restauration ne comptent pas.
- **Pourquoi** : Chaque instance commence par « qu'est-ce qui a bougé ? » : le journal le sait exactement, via GET /api/events?after=N, qui existe déjà.
- **Règle** : Proposé comme FILTRE qui masque (ADR 031), et non comme une nouvelle marque sur la barre de 16 px, pour tenir « un signal par information » (auteur, 2026-07-10). L'ancre reste un état de session.

## 11. Tableau au clavier, déplacer sans glisser

*clavier · effort moyen*

- **Quoi** : Le tableau devient un seul arrêt de tabulation (roving tabindex) : flèches de carte en carte et de case en case, Entrée ouvre la fiche, Alt+← → fait changer d'étape, Alt+↑ ↓ réordonne (beforeId), et un bouton « Déplacer vers… » dans la fiche ouvre un menu étapes × canaux.
- **Pourquoi** : Le §5 promet un repli clavier qui n'existe pas (les barres sont des div cliquables sans tabIndex ni rôle), ce qui viole WCAG 2.1.1 et 2.5.7 ; au pavé tactile, en réunion, une pose à la touche est exacte.
- **Règle** : Aucun : cela comble une exigence du §5. Chaque pose envoie la même intention moved que le glisser ; le réordonnancement est coupé pendant un tri (ADR 044) ; la requalification (changer de canal) doit rester un geste délibéré, pas une flèche nue.

## 12. Fiche en vrai dialogue, focus restitué

*accessibilité · effort faible*

- **Quoi** : La fiche, « + Sujet », Archives et la configuration passent en <dialog> natif (showModal, fond inerte, focus piégé, aria-labelledby) ; à la fermeture le focus revient sur la carte d'origine, et après une création il se pose sur la nouvelle carte.
- **Pourquoi** : On ferme une fiche et l'on est exactement là où l'on était, sans rechercher sa carte parmi 150 ; aujourd'hui aucun composant ne porte de rôle dialog.
- **Règle** : Aucun ; l'événement « cancel » natif doit se brancher sur la pile d'Échap existante, et BlockForm garde son Échap contenu.

## 13. Budget de mouvement (à arbitrer)

*polish · effort faible*

- **Quoi** : Un ADR fixe une règle stricte, 120 ms au plus, opacité et position seulement, pour les couches (fiche, menus, palette, aperçu), jamais sur les cartes ni les chiffres, et tout est coupé sous prefers-reduced-motion. Il tranche aussi les transitions déjà présentes sans décision écrite : la grille (board.css:13, .22s), l'interrupteur de la barre latérale (sidebar.css:55/57, .15s), l'édition en place (modal.css:156, .12s) et le fondu de la flèche de défilement (board.css:117, .18s).
- **Pourquoi** : C'est le levier numéro un de l'impression « logiciel moderne » que tu demandes (Linear, Things), et la règle actuelle est déjà contournée en silence : mieux vaut la légaliser avec un budget, ou retirer ces transitions.
- **Règle** : OUI : §1/§5 n'autorisent que la pulsation du blocage et le rebond de la flèche de défilement. Il faut ton accord explicite et un ADR ; sans cet accord, les quatre transitions existantes devraient être retirées.

## 14. Aperçu au survol, loupe de salle

*séance · effort faible*

- **Quoi** : Le title natif, lent et gris, est remplacé par une carte flottante affichée sans fondu, au survol et au focus clavier : nom complet, code, domaine, « 12 j dans Études », est. k€ et RAF selon la loupe, motif de blocage, dernière décision. En mode séance, la carte passe en 22 px.
- **Pourquoi** : Pendant l'arbitrage, on jette un œil à une barre sans ouvrir la fiche, et un nom en 10 px devient lisible du fond de la salle ; c'est aussi un gain réel pour un malvoyant (WCAG 1.4.13).
- **Règle** : Aucun si l'apparition est franche (sans fondu) et en surimpression (zéro hauteur).

## 15. Frise de parcours dans la fiche

*polish · effort faible*

- **Quoi** : En tête de Délais, visible même repliée, une ligne de 8 px avec un segment par étape traversée, large en proportion des jours passés : périodes bloquées marquées, décisions D1–D6 en losanges, détail au survol (« Études/Cadrage · 34 j »).
- **Pourquoi** : « Quatre mois en Études, bloqué deux fois » se lit d'un coup d'œil au lieu d'une liste ; l'objet le plus « produit » qu'on puisse ajouter sort gratuitement du journal (flowTimes, history).
- **Règle** : Aucun sur la hauteur (c'est dans la fiche). Des hachures seraient un dégradé répété, contraire au principe v13 « aplats » : préférer un aplat rouge pâle.

## 16. Anneau de focus bicolore, cibles de 24 px

*accessibilité · effort faible*

- **Quoi** : Le focus devient un anneau double (encre et filet blanc) dessiné à l'intérieur de la barre, visible seulement au clavier (:focus-visible), et les petits boutons (Σ, chevrons, ✕ des pastilles) reçoivent une zone de clic invisible de 24×24.
- **Pourquoi** : Aujourd'hui le contour bleu déborde sur les barres voisines et disparaît sur le lavis rouge ; un focus net est la signature des interfaces haut de gamme, et des cibles plus grandes évitent les clics ratés au trackpad en réunion.
- **Règle** : Aucun : zéro hauteur (outline-offset négatif, pseudo-élément). Les barres de 16 px restent sous 24 px, ce qui est défendable par l'exception « essentiel » de WCAG 2.5.8.

## 17. Solo domaine depuis la légende

*séance · effort faible*

- **Quoi** : Un clic sur une pastille de la légende d'en-tête isole ce domaine (même état de filtre que la barre latérale, ADR 031) ; un second clic rétablit tout. Au clavier, Alt+1…9 isole un domaine et Alt+0 rétablit.
- **Pourquoi** : La RSP donne la parole aux domaines à tour de rôle : « au tour d'Infra » devient un seul geste, sans ouvrir la barre latérale, et la légende décorative devient un instrument.
- **Règle** : Aucun (même état de filtre, même règle « un sous-domaine rallume son domaine »).

## 18. Annuler le dernier déplacement (Ctrl+Z)

*journal · effort moyen*

- **Quoi** : Après une pose, une ligne sans transition affiche « PE-041 → Actifs · Annuler (Ctrl+Z) » ; annuler écrit un NOUVEL événement moved compensatoire (payload undoOf: evt-N) et n'efface rien.
- **Pourquoi** : Un glisser qui dérape au vidéoprojecteur devant les responsables de domaine se corrige en une touche, et le journal garde l'erreur et sa correction.
- **Règle** : Touche core/ : aujourd'hui un retour arrière remet l'horloge d'âge à zéro (applyPosition) et un faux dépôt en Terminé compterait un livré fantôme. Le fold, les Délais, stage-dwell et lead/cycle doivent traiter la paire undoOf comme nulle, ce qui demande des tests et un ADR.

## 19. Relevé de décisions de séance

*journal · effort faible*

- **Quoi** : « Copier le relevé » met dans le presse-papiers un tableau (HTML et texte) des décisions D1–D6 depuis l'instantané d'ouverture (motifs, échéance, heure), suivi des blocages posés ou levés et des sujets créés ; une feuille d'impression A4 donne la même chose sur papier.
- **Pourquoi** : La trace 7.8 et le « précédent d'avoir arbitré ensemble » sont livrés à la clôture, lus à voix haute pour validation, au lieu d'un compte rendu recopié deux jours après.
- **Règle** : Aucune sortie réseau, mais des titres (données défense) quittent l'outil sur papier ou par le presse-papiers : à confirmer avec la classification (§12, décision ouverte). navigator.clipboard exige HTTPS : sur un LAN en HTTP (INSECURE_COOKIES), prévoir l'impression seule.

## 20. Réglages système respectés

*accessibilité · effort très faible*

- **Quoi** : En mode Contraste de Windows (forced-colors), qui efface aujourd'hui le lavis de blocage, le ticket bloqué prend une bordure pointillée en couleur système ; sous prefers-reduced-motion, qui ne coupe aujourd'hui que la flèche de défilement, la pulsation du bandeau BLOCAGE devient un anneau rouge fixe.
- **Pourquoi** : « Les blocages crient », mais seulement pour qui voit le rouge et supporte le mouvement ; respecter les réglages du poste est un marqueur de soin attendu (WCAG 1.4.1, 2.2.2).
- **Règle** : La partie forced-colors ne touche aucune règle. La pulsation est « non négociable » (§1) : elle reste active par défaut et ne cède que si le poste le demande, ce qui demande ton accord.

## Aussi envisagé

- Brouillon d'arbitrage / simulation de ligne de coupe (RAF engagé A&D 1 240 → 980 j.h) : la plus forte valeur RSP, mais effort L, et affiche un état non tracé (principe de l'ADR 040). À traiter comme une vraie feature avec ADR, pas comme un nice-to-have.
- Vue présentateur à deux fenêtres (BroadcastChannel) : effort L ; le mode séance et le rideau couvrent l'essentiel.
- Projecteur sur le sujet (fiche ancrée à droite en séance, reste assombri) : effort M, revient sur la fiche centrée v11, à décider par l'auteur.
- Minuteur de séance et temps par sujet : effort S, mais c'est un nouvel élément d'en-tête, et reste à trancher si le conducteur vient de la config ou d'une saisie à l'ouverture.
- Revoir le tableau tel qu'il était (instantané en lecture seule, foldEvents jusqu'au logSeq) : effort M, puissant mais moins utile en séance courante.
- Comparer deux instantanés (+ ~ −, écarts k€ et RAF par colonne) : effort S en core/, mais recoupe « Depuis la dernière séance ».
- Relecture pas à pas des gestes (← →) : effort M, dépend de la vue historique ; une version animée serait interdite.
- Journal de séance (liste des gestes depuis l'ouverture) : effort S, recoupe le relevé et le filtre « depuis » ; l'acteur vaut « anonymous » avant RP3.
- Lien direct vers une fiche (#carte=PE-041@2026) et « Copier le code » : effort S, utile hors séance ; un code projet dans l'URL est à vérifier avec la classification.
- Jeu d'icônes SVG unique : déjà amorcé en v13 (front/components/icons.tsx, sans bibliothèque) ; il suffit de le compléter (archives, import, instantané, lien) plutôt que d'ajouter lucide-react.
- Glisser-déposer soigné (setDragImage « PE-041 → Actifs », compteur WIP prévisionnel au survol) : effort S, joli, mais c'est le geste souris qu'on cherche à réduire en séance ; jamais de pose optimiste (ADR 040).
- Préréglages de vues de séance (Alt+Maj+1…5) : effort S en mémoire vive ; pour survivre au rechargement, il faut étendre l'ADR 020 ou attendre un stockage serveur après RP3.
- Réticule ligne/colonne au survol : effort S ; la teinte ne doit pas hériter de la transition de .board.
- Garde-fou de palette dans Catégories (proximité du rouge d'alerte et de l'âge ancien, simulation daltonienne) : effort M avec core/ et tests ; pertinent après la recoloration ERP/OBS.
- Liens d'évitement et repères nommés (header/nav/main/aside) : effort XS, à glisser dans le chantier clavier.
- Mode salle contraste (Maj+P, prefers-contrast) : fusionné dans le mode séance ; superflu si la v13 est adoptée telle quelle.
- Curseur-anneau de 40 px en séance : remplacé par le curseur masqué au repos, plus sobre.
- Hachures sur le lavis de blocage : écartées (second signal de fait et dégradé contraire aux aplats v13) ; la partie forced-colors est retenue au rang 20.
