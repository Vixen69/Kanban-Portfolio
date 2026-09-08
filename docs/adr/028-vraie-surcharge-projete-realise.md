# ADR 028 — La vraie surcharge : projeté et réalisé par personne sur tout le plan de charge

## Contexte

- Premier import réel (2026-09-08) : 184 personnes, 25 472 j.h de capacité,
  mais les 142 cartes du tableau ne pèsent que 4 951 j.h, dont 4 197
  nominatifs. La vue capacité (ADR 025) comparait la capacité **entière**
  des personnes à la demande du **seul périmètre** : elle affichait une
  charge globale autour de 17 % là où le plan de charge complet dit
  25 011 j.h prévisionnels, une DSI pleine à 98 % dont le tableau ne voit
  qu'un cinquième. L'auteur : « il faut le projeté et le réalisé en plus
  de la capacité de base pour voir ce qu'on peut dire ».
- Le plan de charge porte déjà ces totaux par matricule (toutes lignes,
  tous projets) — c'était la « consolidation nominative » du rapport ; ils
  n'entraient pas dans le snapshot.
- Référentiel V3.1 : la contrainte réelle est celle des ressources
  **internes** transverses ; les indicateurs éclairent, ne décident pas.

## Décision

1. **La personne porte trois charges** : `capacityJh` (Disponibilité),
   `plannedJh` (projeté 2026 sur tout le plan de charge, null si absente du
   PdC) et `doneJh` (réalisé 2026, idem). Les affectations aux cartes
   restent la demande du tableau. L'assembleur crée un stub pour toute
   personne du PdC sans fiche, périmètre ou non, pour que les totaux soient
   ceux de toute la DSI.
2. **Le cœur lit deux niveaux** (`core/capacity.ts`) : `ratio` = demande du
   tableau / capacité, `engagement` = projeté / capacité (la vraie
   surcharge), `outsideJh` = projeté − demande du tableau (le hors tableau).
   Les groupes (domaine, profil, transverse) portent en plus la coupe
   **internes / externes** (capacité, projeté, engagement de chaque sous-
   ensemble). Les surcharges se classent sur l'engagement ; à défaut de plan
   connu, sur le ratio du tableau.
3. **La vue** : six chiffres de tête — capacité, projeté, engagement,
   avancement (réalisé / projeté, mis en regard de la part de l'année
   écoulée), part du tableau dans le projeté, personnes au-delà de 100 %.
   La matrice transverse gagne projeté, engagement, dont tableau, dont hors
   tableau, et une ligne internes / externes par domaine transverse. Les
   barres par domaine et par profil montrent l'engagement, la part du
   tableau en plein dedans. La liste des surcharges est sur l'engagement,
   avec la part du tableau de chacun.
4. **L'avancement à date** est un constat, pas une prévision : « réalisé
   33 % du projeté à 69 % de l'année » se lit comme un plan gonflé, une
   année chargée sur la fin, ou des réels non saisis — la vue le dit et ne
   tranche pas (règle 8.3 du référentiel : éclairer, jamais décider).
5. Le rapport d'audit porte les mêmes totaux (ligne « capacité » :
   projeté et réalisé sur tout le plan de charge) pour vérification avant
   la vue ; les fixtures donnent aux personnes un projeté au-delà du
   tableau pour que la démonstration montre l'écart.

## Conséquences

- La question centrale de la RSP devient lisible : si A&D est engagé à
  110 % et que le tableau n'en prend que 25 %, le portefeuille ne se
  débloque pas seul ; le hors tableau (run, autres portefeuilles) est nommé.
- Hypothèse maintenue jusqu'à réponse du PMO (Q24) : Disponibilité est une
  capacité annuelle ; si elle est résiduelle, on comparera au reste à faire
  (projeté − réalisé) plutôt qu'au projeté.
- Un import antérieur à cet ADR laisse `plannedJh` null : la vue retombe
  sur le ratio du tableau et le dit (« hors plan de charge »).
