# Proposition de passe graphique « v13 »

Date : 2026-09-29 · Statut : **proposition à tester**, sur la branche
`proposition-design` — rien n'est adopté sur `main`.

## Ce que c'est

Une seule feuille de style, `front/styles/design-v13.css`, chargée en
dernier : elle ne fait que surcharger. Retirer son import dans
`front/main.tsx` rend le tableau d'avant à l'identique. S'y ajoutent
quelques retouches de composants, listées plus bas.

## Tester

```
git fetch
git checkout proposition-design
```

Puis « Lancer le tableau » (ou, sur la VM, `docker compose -f
docker/compose.yaml --profile app up -d --build`). Revenir :
`git checkout main` et relancer.

À juger sur le vrai vidéoprojecteur, depuis la place la plus éloignée, la
lumière au-dessus de l'écran éteinte.

## Les principes (état de l'art)

- **Le gris dit « normal », la couleur dit « anormal »** — conduite de
  process haute performance (ISA-101, ASM Consortium, Hollifield & Perez) ;
  une teinte, un seul sens. Le bleu ne dit plus qu'une chose : « ces
  chiffres portent sur un ensemble restreint » (filtres, loupe,
  retenus/total). Le focus, les boutons enfoncés et « + Sujet » passent au
  neutre.
- **Deux paliers de lisibilité** : ce qui se lit du fond de la salle (noms
  de colonnes, comptes, chiffres de l'en-tête, le RAF engagé) à 13 px et
  plus ; le reste à 10 px au moins. Plus rien d'informatif à 7–8 px
  (AVIXA DISCAS, APCA).
- **Une seule échelle de tailles** : 9 (sigles en capitales), 10, 11, 13,
  16, 22 px — au lieu de quinze tailles différentes. La hiérarchie se fait
  par la graisse (IBM Carbon, Microsoft Fluent 2).
- **Aplats 2-D** : plus de dégradé (case en dépassement WIP), plus de flou
  (fenêtres), plus d'ombres décoratives. Les cartes sont cernées d'un filet
  fin, lisible au projecteur.
- **Zéro hauteur en plus** : barres à 16 px, en-tête à 44 px, en-têtes de
  colonne à 67 px — mesuré, inchangé ; aucun défilement à 1920×1080.

## Ce qui change à l'écran

- Titre en DM Sans 16 px gras au lieu du DM Serif 17 px (plus lisible au
  projecteur, jamais sur deux lignes).
- Noms de colonnes 13 px ; comptes, jalons (RDO, RDLI…) et badges DoR/DoD
  lisibles (9–10 px au lieu de 7–9) ; totaux des en-têtes 10 px, unités à
  la même taille.
- Barres : noms et codes 10 px (au lieu de 9) ; âge 10 px, en couleur
  seulement quand il alerte ; étoile Top en encre (l'ambre est réservé à
  l'alerte) ; filet de carte visible.
- Blocage : lavis rouge un peu plus soutenu et barre plus sombre (même
  règle « lavis rouge seul »).
- Encours dépassé : aplat rouge pâle et anneau rouge, sans dégradé.
- Pastilles de l'en-tête : une seule forme ; bleu cerclé pour ce qui
  restreint les chiffres (filtres, loupe), neutre pour le focus et le tri.
- Menu de l'engrenage : trois groupes titrés — Consulter, Données, Modèle.
- Coin du tableau : les deux Σ gardent chacun leur flèche vers ce qu'ils
  déplient (▸ vers les en-têtes, ▾ vers la colonne des totaux) ; l'état
  déplié se lit au bouton enfoncé.
- Barre latérale, fiche, panneaux, Analytics : les petits libellés en
  capitales espacées deviennent des libellés 10 px en minuscules.
- Canaux : nom 13 px, nature en minuscules ; gouttière des canaux 50 px.
- « Passer à l'exercice N+1 » devient un bouton de danger (geste
  irréversible).
- Les milliers sont séparés par une espace insécable que la police
  possède (la fine insécable du français manquait dans DM Sans).

## Ce qui attend une décision de l'auteur

- **La police.** DM Sans n'a pas de chiffres à chasse fixe : les colonnes
  de chiffres ne s'alignent pas et bougent quand la loupe change les
  valeurs. La recherche recommande **Inter** (licence OFL, auto-hébergée,
  deux fichiers woff2) — variante B : IBM Plex Sans. Il faut la
  télécharger : à autoriser explicitement.
- **Les couleurs de catégories** (à essayer sans code, par Configuration
  du tableau › Catégories, réversible) : ERP est rouge et IND/IT4 orange —
  des teintes d'alerte portées par des catégories normales ; le type OBS
  a exactement la couleur de l'âge « ancien ». Proposé : ERP #4d7c0f,
  IND #8a6f55, IT4 #0369a1, VDU #6b7280, OBS #57534e.
- Variantes qui iraient contre une décision passée, à ne tester qu'en A/B :
  barre de blocage inversée (texte blanc sur rouge foncé), étiquettes de
  type teintées au lieu de pleines, flèche de défilement fixe au lieu de
  l'animation.

## Sources principales

ISA-101 et ASM Consortium (affichages de conduite haute performance) ;
B. Hollifield, *The High Performance HMI Handbook* ; S. Few, *Information
Dashboard Design* ; E. Tufte ; AVIXA DISCAS V202.01 (taille minimale au
projecteur) ; WCAG 2.2 et APCA (contraste) ; IBM Carbon, Microsoft
Fluent 2, Atlassian Design System (densité, échelles de texte) ; Nielsen
Norman Group (menus, régions communes).
