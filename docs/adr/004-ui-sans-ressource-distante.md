# ADR 004 — UI sans ressource distante (écart assumé avec la maquette)

## Contexte

La maquette de référence (`design/`) charge les polices DM Sans / DM Serif
Display depuis Google Fonts et React depuis unpkg. Le contrat interdit
toute ressource distante : zéro egress, pas de CDN, pas de polices
externes (CLAUDE.md §2).

## Décision

- **Polices système uniquement** : `system-ui, "Segoe UI", Roboto,
  "Helvetica Neue", Arial, sans-serif`. L'esthétique « pupitre
  industriel » (neutres clairs, densité, hiérarchie par la taille et la
  graisse) est conservée ; l'identité typographique serif du titre est
  abandonnée.
- React est servi depuis le bundle local (Vite) ; aucune balise script ou
  link ne pointe hors de l'origine.
- Le CSS est intégralement écrit à la main (`ui/styles.css`), sans
  bibliothèque de composants, conformément au contrat.
- Écarts supplémentaires avec la maquette, imposés par le contrat :
  - pas de colonne « Pause » (hors topologie du contrat §4) ;
  - `wipLimit: null` partout (« non defini ») — les valeurs seront
    calibrées sur le flux réel ;
  - pas de criticité/nature/type sur les cartes (hors modèle de données
    §4) ; la carte normale montre titre, domaine, responsable, tags, âge ;
  - pas de transitions CSS décoratives : la seule animation est la
    pulsation des cartes bloquées.

## Conséquences

- L'application se charge et fonctionne entièrement hors-ligne, y compris
  en développement.
- Le rendu typographique varie légèrement selon l'OS (Segoe UI sur
  Windows) ; assumé.
- Si l'identité visuelle doit se renforcer, une police pourra être
  **vendorisée localement** (fichier woff2 dans le dépôt) — jamais
  référencée à distance ; cela exigera une mise à jour de cet ADR.
