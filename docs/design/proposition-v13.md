# Proposition de passe graphique « v13 »

Date : 2026-09-29 · Statut : **proposition à tester**, sur la branche
`proposition-design` — rien n'est adopté sur `main`.

## Ce que c'est

Une feuille de style, `front/styles/design-v13.css`, chargée en dernier :
elle ne fait que surcharger. Retirer son import dans `front/main.tsx` rend
le tableau d'avant. S'y ajoutent la police Inter, un petit jeu d'icônes
vectorielles dessinées dans le code (`front/components/icons.tsx`) et
quelques retouches de composants.

## Tester

```
git fetch
git checkout proposition-design
```

Puis « Lancer le tableau » (ou, sur la VM, `docker compose -f
docker/compose.yaml --profile app up -d --build`). Revenir :
`git checkout main` et relancer. À juger sur le vrai vidéoprojecteur,
depuis la place la plus éloignée.

## La direction

Un instrument moderne et net, dans la veine des logiciels professionnels
récents (Linear, Vercel, Raycast), sans rien perdre de la densité :

- **Un bandeau d'en-tête sombre** qui cadre l'écran et porte l'identité :
  titre blanc, sélecteur d'année et pastilles translucides, bouton
  « + Sujet » blanc, engrenage discret.
- **Le tableau posé comme un panneau** aux coins arrondis : en-têtes et
  étiquettes de canal clairs, cases en gris (les « puits »), cartes
  blanches cernées d'un filet fin.
- **Une seule police, Inter** : chiffres à chasse fixe (les colonnes de
  chiffres s'alignent enfin et ne bougent plus quand la loupe change les
  valeurs), l'espace fine insécable des milliers, une meilleure lisibilité
  des petites tailles.
- **Des icônes vectorielles** au lieu des caractères ≡ ‹ › ▸ ▾ ✕ ★, qui
  changeaient d'une police à l'autre et bavaient au projecteur.
- **Des étiquettes de type teintées** (fond pâle, texte de la couleur du
  type) au lieu des pastilles pleines saturées : ~150 étiquettes criardes
  deviennent calmes, et le rouge du blocage ressort. C'est un retour sur le
  « plus visible que le domaine » du design v9 — à juger.
- **Le gris dit « normal », la couleur dit « anormal »** (conduite de
  process ISA-101, ASM Consortium, Hollifield) ; le bleu ne dit plus
  qu'une chose : « ces chiffres portent sur un ensemble restreint »
  (filtres, loupe, retenus/total). Boutons enfoncés, onglet actif et
  bouton principal passent à l'encre.
- **Une échelle de tailles** (9 sigles, 10, 11, 13, 15, 22–26 px), rien
  d'informatif sous 9 px, la hiérarchie par la graisse.
- **Aplats, sans dégradé ni flou** ; ombres réservées à ce qui flotte
  (menus, fenêtres), aux coins plus doux.
- **Aucune animation ajoutée ; hauteurs tenues** : en-tête 44 px, en-têtes
  de colonne 66 px (67 avant), barres 16 px ; aucun défilement à
  1920×1080. Le tableau perd 12 px de hauteur utile au cadre.

## Autres retouches

- Menu de l'engrenage en trois groupes titrés : Consulter, Données, Modèle.
- Les deux Σ du coin gardent leur flèche vers ce qu'ils déplient ; l'état
  déplié se lit au bouton enfoncé (encre).
- « Passer à l'exercice N+1 » devient un bouton de danger (irréversible).
- Les couleurs du blocage passent en variables (lavis un peu plus soutenu,
  barre plus sombre ; même règle « lavis rouge seul »).
- Canaux : nom 13 px, nature en minuscules, gouttière des canaux 50 px.

## Laissé à l'auteur

- **Couleurs des catégories** (l'auteur les change par Configuration du
  tableau › Catégories) : ERP rouge, IND/IT4 orange, OBS de la couleur de
  l'âge « ancien » portent des teintes d'alerte.
- Variantes qui iraient contre une décision passée, à tester en A/B
  seulement : barre de blocage inversée (texte blanc sur rouge foncé),
  flèche de défilement fixe au lieu de l'animation.
- Les micro-fonctionnalités de finition proposées :
  `docs/design/idees-finition.md`.

## Sources principales

ISA-101 et ASM Consortium ; B. Hollifield, *The High Performance HMI
Handbook* ; S. Few, *Information Dashboard Design* ; E. Tufte ; AVIXA
DISCAS V202.01 ; WCAG 2.2 et APCA ; IBM Carbon, Microsoft Fluent 2,
Atlassian Design System ; Nielsen Norman Group.
