# Spécification du mapping d'import — exports PPM (Sciforma)

> Document de travail, préparé avec le PMO. Version du 2026-07-29.
> Contrat de l'adaptateur `csv-import` (phase RP4). Évoluera au fil des
> séances d'analyse des exports ; les questions ouvertes sont en fin de
> document. L'ADR de l'adaptateur sera rédigé au moment de sa construction.

## Principes

1. **Le parseur ne devine jamais en silence.** Tout ce qui est lu finit dans
   le rapport d'import : *pris* (avec sa destination), *écarté* (avec la
   raison), *douteux* (avec la question précise à trancher).
2. **Mode audit d'abord.** La première version ne charge rien : elle ne
   produit que le rapport. L'import réel n'est activé que lorsque le rapport
   est propre.
3. **Aucune donnée réelle sur la machine de l'auteur.** Aucun fichier
   client ne traverse, même blanchi (choix de prudence, 2026-07-29) — seule
   exception : la table `RDOM` (domaine ↔ nom de responsable de domaine),
   composée par l'auteur lui-même. Elle contient des noms réels : **jamais
   dans le dépôt ni dans les fixtures** (noms synthétiques ici) ; le vrai
   CSV est créé côté client, hors dépôt. Le développement se fait sur des
   **squelettes synthétiques fabriqués d'après les descriptions de
   l'auteur** (relevé de structure ci-dessous) ; leur exactitude est
   vérifiée côté client par le contrat d'en-têtes du parseur en mode audit
   — toute divergence est signalée à la première exécution, corrigée par
   itération verbale.
4. Les libellés non reconnus (métiers, types, portefeuilles…) sont
   **signalés, jamais ignorés silencieusement** : liste blanche + rapport.

## Construction par étapes (tranché 2026-07-29)

Le parseur se construit et se livre **fichier par fichier**, dans l'ordre :

1. **`RDOM`** — lecture de la table domaine ↔ nom, contrôle des domaines
   contre `config/board.json`, doublons de nom entre domaines signalés,
   rapport.
2. **`SP_total`** — les cartes (identité, type, jalons → position, budgets).
3. **`projet`** — le chef de projet (responsables moins les noms `RDOM`) et
   le domaine (responsable de portefeuille → table `RDOM`). Le domaine ne se
   résout qu'à cette étape ; d'ici là le rapport affiche « domaine : en
   attente de `projet` ».
4. **`ressources_PDC`** — le plan de charge, en dernier.

**Modèle d'invocation : sans état caché.** À chaque exécution, le parseur
lit le dossier d'entrée, prend les fichiers reconnus qui s'y trouvent,
refait l'assemblage complet et produit le rapport. On ajoute les fichiers
au fur et à mesure ; chaque passage redonne l'inventaire et l'état du
recollage (« domaine : en attente du fichier `projet` »). Idempotent,
re-jouable, rien à mémoriser entre deux exécutions.

## Fichiers sources

| Fichier | Contenu | Rôle |
|---|---|---|
| `SP_total` | Les sujets/projets : identité, type, jalons, budgets | Source principale des cartes |
| `projet` | Organisation : portefeuilles, responsables 1/2/3, responsable de portefeuille | Domaine + chef de projet |
| `RDOM` | Table domaine ↔ nom de famille du/des RDOM (2 colonnes : domaine, nom ; une ligne par nom, un domaine peut en avoir plusieurs). Double usage : domaine via le responsable de portefeuille, ET liste d'exclusion pour le chef de projet | Composé par l'auteur, CSV côté client, **hors dépôt** (noms réels) |
| `ressources_PDC` | Plan de charge : une ligne par affectation ressource × projet, phasé par année (prévisionnel/réel) | `chargeByProfile` + analyse nominative |

## `SP_total` — mapping des colonnes

`SP_total` n'a **pas de colonne ID projet dédiée** : le code n'y existe que
lorsqu'il est documenté dans le Nom.

Libellés réels (relevé du 2026-07-29) :

| Colonne réelle | Champ carte | Règle |
|---|---|---|
| « Nom » (code + libellé) | `codename` + `title` | Découpage : code `PE` + 5 chiffres (souvent, pas toujours présent), le reste = titre. **Le nom fait foi comme clé de jointure** (voir Règles) |
| « Type » | `typeId` | Correspondance directe (Obsolescence, TMA Corrective, Achat…) ; libellés inconnus signalés |
| « Priorité », « Score criblage », « Top projet », « Catégorie », « Notes », « Menu », « * CAT global projet », « Budget présenté PDSI », « ME Achats », « Réel Achats » | — | Ignorées (connues et voulues — listées une fois au rapport, jamais en silence) |
| « Responsable 1 » | — | Non fiable (parfois le RDOM) ; le chef de projet vient de `projet` |
| « État suivant autorisé » | — | Candidat pour la position amont (Q1) ; relevé des valeurs distinctes au rapport |
| « Début » | `createdAt` | Tranché avec le plan d'étape 2 (ex-Q6) |
| « Jalon RVSR ou Fin » | — | Fin prévue « historique » ; non retenu a priori (Q10) |
| « Jalon RDLI validé » | → position | Daté et passé = projet lancé = colonne **Actifs** (Q15 : date future = signalé, pas de position) |
| « Jalon RDR validé (Réf.8) » | → position | Daté et passé = **Exploitation** (Q2 tranchée) |
| « Jalon RDR prévisionnel » | `dateRdr` | Date de livraison projetée |
| « * Budget validé RDLI » | `budgetRdli` | Enveloppe RDLI, k€ (astérisque = note du préambule) |
| « Coût prév (ME) » | `budgetEstimated` | Meilleur estimé, k€ |
| « Coût réel » | `budgetConsumed` | k€ |
| « Engagé Achats » | `budgetEngaged` | k€ |

## `projet` — mapping des colonnes

| Colonne | Usage |
|---|---|
| ID projet + Nom projet | Jointure avec `SP_total` **par le nom** (qui fait foi) ; l'ID est récolté comme `codename` + contrôle croisé |
| Portefeuille | Ignoré (le domaine vient du responsable de portefeuille — tranché 2026-07-29) |
| Responsable 1 / 2 / 3 | → `owner` : exclure les noms de la table `RDOM`, le restant = chef de projet |
| Responsable de portefeuille | → `domain` : nom de famille rapproché de la table `RDOM` (tranché 2026-07-29, Q5) |
| Catégorie / type | Redondant avec `SP_total`, ignoré |

## `ressources_PDC` — structure et mapping

Une ligne = une affectation (personne ou générique) × projet. Une personne
apparaît sur plusieurs lignes (plusieurs projets) ; un projet sur plusieurs
lignes (plusieurs ressources).

| Colonne | Usage |
|---|---|
| Matricule | **Discriminant nominatif** : rempli = ligne personne, vide = ligne générique. Non stocké dans le produit. Candidat id opaque stable si le module nominatif est construit (voir plus bas) |
| Ressource | Nom de la personne (si nominatif), ou libellé générique/rôle. Les rôles exotiques (ex. « Concepteur développeur Low Code ») ne bloquent pas : le profil vient de la colonne Métier ; signalés au rapport |
| Organisation | Ignorée (le domaine vient de `projet` + table `RDOM`) |
| Métier | → **profil DSI** (`profileId`). Liste blanche des 19 profils, normalisation : casse, espaces, points, retrait des préfixes (« Externe. », noms de société type « Nexter. »). Préfixes rencontrés listés au rapport (signification à confirmer, Q9) |
| ID projet | Toujours rempli, semble-t-il. Récolté comme `codename` + **contrôle croisé** avec la jointure par nom (désaccord = drapeau) |
| Nom projet | **Clé de jointure** (le nom fait foi, stable entre fichiers) |
| Type projet, Portefeuille | Ignorés (redondants) |
| Années 2023, 2024, 2025(, 2026 — Q7), chacune en 2 colonnes prévisionnel / réel | **Seul 2026 est lu** : prévisionnel 2026 → `jh` (planifié), réel 2026 → `done` (consommé). Unité attendue : jours (Q8) |
| Total (pluriannuel) | Ignoré |

**Agrégation** : les lignes d'un même projet × métier (× personne) sont
sommées — jamais supposées uniques. Les fusions (variantes de préfixe, etc.)
sont tracées au rapport.

## Règles de dérivation

- **Jointure inter-fichiers : le nom de projet fait foi** (tranché
  2026-07-29). Il est stable et identique entre fichiers ; jointure sur le
  nom normalisé (casse, espaces, accents), rapprochements approximatifs
  seulement proposés au rapport. Le code `PE…` n'est **pas** la clé : c'est
  une donnée récoltée (`codename`) partout où elle apparaît (colonne ID
  projet de `projet` et `ressources_PDC`, ou embarquée dans le Nom de
  `SP_total`) et un **contrôle croisé** — un même nom associé à deux codes
  différents, ou l'inverse, lève un drapeau. Aux ré-imports, le code récolté
  sert de **détecteur de renommage** : un nom disparu + un nom nouveau
  portant le même code = probable renommage, proposé au rapprochement au
  lieu de créer un doublon.
- **Chef de projet** : responsables 1/2/3 de `projet`, moins les noms de la
  table `RDOM` (tranché 2026-07-29, ex-Q4) ; le restant = `owner`.
- **Domaine** : responsable de portefeuille de `projet` → nom de famille
  rapproché de la table `RDOM` → domaine (tranché 2026-07-29, ex-Q5 ;
  `CORRESP` abandonné). Rapprochement par nom normalisé (casse, accents) ;
  cellule sans aucun nom connu, ou en portant plusieurs → douteux au
  rapport, jamais d'affectation devinée.
- **Position sur le board** (instantané d'import) :
  - Jalon RDR validé présent → **Exploitation** (tranché 2026-07-29 : le
    tableau sert à arbitrer le *milieu* du flux ; l'aval n'est pas
    différencié à l'import, Done reste un état vécu dans l'outil) ;
  - sinon jalon RDLI présent → **Actifs** ;
  - sinon → amont (Demandes/Qualification/Études/Prêts — règle à définir, Q1).
- **Canal** : rien dans les exports ne le donne — règle à définir (Q3).
- **Nature** : jamais importée — conférée par le canal (ADR 018).
- **Criticité** : non présente dans les exports → `normal` par défaut.
- Champs non couverts par les exports (ressources clés, risques,
  contraintes, alertes, blocage, notes, tags) : vides à l'import, vécus
  dans l'outil.

## Constantes de référence

- **200 j.h/an = 1 ETP.** Base de la lecture « taux d'affectation » : une
  personne à 400 j.h affectés sur l'année ≈ 2,0 ETP → surcharge manifeste.
  La validité repose sur la fenêtre annuelle (on ne somme que 2026).

## Rapport d'import (spécification)

Produit à chaque exécution (mode audit comme mode réel) :

0. **Inventaire** : les fichiers reçus (nom, taille, en-têtes reconnus ou
   non), les fichiers attendus manquants, et l'état de l'assemblage — ce qui
   est recollé, ce qui attend un autre fichier (« domaine : en attente de
   `projet` »).
1. **Pris** : chaque valeur importée avec sa ligne source et sa destination.
2. **Écarté** : chaque ligne/valeur non prise, avec la raison (hors 2026,
   colonne ignorée, ligne vide…).
3. **Douteux** : chaque cas ambigu avec la question précise (libellé métier
   inconnu, projet sans code, personne sans métier, jointure par nom…).
4. **Sommes de contrôle par projet** : total j.h lu et sa répartition,
   comparé au total du fichier quand il existe ; tout écart = drapeau.
5. **Consolidation nominative** (hors produit) : par personne, j.h affectés
   2026 tous projets / 200 → taux ETP, trié décroissant. C'est l'outil de
   démonstration des surcharges tant que le module nominatif n'existe pas.
6. **Préfixes et variantes rencontrés** (métiers, sociétés) et fusions
   opérées.

**Vérification manuelle** : ~20 projets sur les ~150, choisis exprès (plus
gros budgets, nominatif, tout-générique, cas signalés par le rapport).

**Granularité (précisé à l'étape 2)** : le « pris » est **par carte** (une
ligne par sujet, avec sa position) ; les anomalies de **cellules**
(illisibles, futurs, unités, codes anormaux…) sont **agrégées par motif et
par colonne** — compte + jusqu'à 8 numéros de ligne — pour qu'un export de
1 400 lignes reste lisible sans rien perdre de localisable.

## Pièges anticipés — contrôles obligatoires du parseur

Le parseur est volontairement tatillon : chaque contrôle ci-dessous produit
un avertissement au rapport, jamais un abandon silencieux.

**Contrat d'en-têtes.** À chaque exécution, l'ensemble exact des colonnes
attendues est validé ; toute dérive (colonne insérée, renommée, dupliquée,
onglet inconnu) est signalée avant toute lecture — c'est le tueur n°1 sur la
durée, les fichiers évoluent au gré des mains qui les remplissent. Les
années sont très probablement des en-têtes à deux niveaux (« 2026 »
fusionné au-dessus de Prévisionnel/Réel) : reconstruction explicite.

**Structure des lignes.** Cellules fusionnées (la valeur n'existe que sur la
première ligne d'un groupe → trous apparents dans les colonnes clés) ;
lignes de total/sous-total insérées au milieu (libellé « Total… » ou valeur
≈ somme des voisines) → exclues et signalées, c'est le risque de double
compte ; lignes vides ou de commentaire.

**Nombres et dates à la française.** Virgule décimale, espaces de milliers,
nombres stockés en texte, « N/A », « - », « ? », erreurs de formule
(#REF!, #N/A), valeurs négatives, unités écrites dans la cellule → tout
est signalé. Dates : formats FR (heure tolérée), années à 2 chiffres
(pivot 70 : 70-99 → 19xx, 00-69 → 20xx), numéros de série Excel (lus et
**signalés** — c'est une interprétation), « oui »/« x » (compté passé +
signalé) et les booléens Excel VRAI/FAUX (« FAUX » = non explicite, sans
bruit). Un jalon daté dans le futur (RDLI *prévue*, pas *passée*) ne vaut
pas position Actifs (Q15) — comparaison sur la date **locale** du poste
qui exécute l'audit.

**Jointures et orphelins.** Orphelins listés dans les deux sens (projet du
PDC absent de `SP_total`, projet de `SP_total` absent de `projet`…), jamais
perdus. Variantes de noms (accents, casse, espaces, troncatures) :
normalisation + rapprochements *proposés* au rapport, jamais fusionnés
d'office. Codes `PE` anormaux (4/6 chiffres, espaces, minuscules) : lecture
tolérante + signalement.

**Rapprochement par nom de famille (domaine).** Certains noms de RDOM sont
des patronymes très courants (ou homographes d'un prénom) : le
rapprochement se fait sur la cellule responsable de portefeuille entière et
normalisée (casse, accents, « NOM Prénom »/« Prénom NOM »/initiales),
jamais par sous-chaîne lâche. Zéro correspondance, ou deux noms `RDOM`
possibles dans la même cellule → douteux au rapport. Un homonyme parmi les
responsables 1/2/3 (même nom qu'un RDOM mais autre personne) exclurait à
tort le chef de projet : les exclusions sont listées au rapport pour
contrôle.

**Personnes.** Même personne sous plusieurs orthographes (« DUPONT J. » /
« Jean Dupont ») : le matricule fait foi quand il est là ; sinon
rapprochement proposé, jamais automatique — une fusion ratée sous-estime la
surcharge, une fusion abusive l'invente. Personne sous deux métiers :
sommée au rapport nominatif, signalée. Ligne avec charge mais métier vide :
comptée dans le total du projet (seau « non attribué », les sommes de
contrôle restent justes), jamais jetée, questionnée.

**Cohérences métier.** Réel 2026 > prévisionnel 2026 : cas réel et fréquent
— notre modèle contraint aujourd'hui `done ≤ jh`, à assouplir avant
l'import (Q12). Combinaisons de jalons incohérentes (RDR validé sans
RDLI…) : position selon la règle ordonnée, combinaison signalée. Projet de
`SP_total` sans ligne dans `projet` (domaine/chef inconnus) : sort à
décider (Q14). Projet présent au PDC mais sans aucune charge 2026 :
signalé.

**Format d'entrée : CSV (Q13 tranchée, 2026-07-29).** Aucune bibliothèque
`.xlsx`, donc rien à faire valider au plafond SBOM. En contrepartie, une
**procédure d'export figée côté PMO** : un CSV par feuille utile, en-têtes
aplatis sur une ligne, encodage UTF-8 imposé (sinon Windows-1252 mutile
les accents — l'encodage est détecté et signalé au rapport, jamais deviné
en silence). Attention au « CSV » d'Excel français : séparateur `;` et
virgule décimale — le lecteur les attend, et signale tout fichier qui
dévie.

## Extension future : module nominatif (décision de principe, non planifiée)

Direction validée par l'auteur (2026-07-29), construction après le parseur :

- `ChargeEntry` gagne un `personId` **optionnel** — une carte mélange lignes
  génériques (profil seul) et nominatives (profil + personne). Les
  agrégations par profil sont inchangées.
- Registre des personnes dans la **config du board** (panneau admin, cadre
  ADR 013) : id opaque, nom, profil, capacité. **Les noms ne vont jamais
  dans l'event log** — ids opaques seuls (effaçabilité RGPD compatible avec
  l'append-only). Le matricule de `ressources_PDC` est le candidat naturel
  d'id stable.
- Vue Metrics : bloc « mobilisation nominative » = j.h affectés 2026 / 200
  → taux ETP par personne, seuil rouge au-delà de ~1,0–1,1.
- Restent à décider au lancement : visibilité du bloc (restreint PMO/admin
  pressenti), valeur exacte de la constante, ADR dédié.

## Relevé réel des exports (2026-07-29, VM cliente — via le rapport d'audit)

Premier passage du parseur sur les exports réels : les en-têtes ci-dessous
sont recopiés du rapport (aucun fichier n'a quitté la VM). Tous les exports
riches sont en **Windows-1252** (détecté et signalé).

**`Projets.csv`** (l'export `projet` ; 1,2 Mo, ~1 357 lignes) — colonnes :
Fichier · Id · **Nom** · **Domaine** (présence inattendue, vocabulaire à
identifier — voir questions) · Portefeuille · Type · Nature · État du
processus · État du budget · **Responsable 1/2/3** ·
**Responsable portefeuilles** (pluriel) · Nature du projet · « Priorité. »
(point final) · Criticité · Score total · Début · Date T0 · Date
prévisionnelle de démarrage (RDO) · Date prévisionnelle de déploiement ·
Fin · Descriptions texte riche · Objectifs · **Impact si report du projet
(colonne dupliquée, présente deux fois)** · Entité demandeur · Entité
payeur · Entité payeur mutualisée · Directions Participantes · Programme
métier · Outils · Exigences légales et/ou de sécurité · Charge JH · Taux
TUO · les familles budget : Budget PDSI Présenté Charge (Res) (J) /
Coût (Res) / Coût (Trans) / « Budget  Présenté PDSI Total Coût (Res+Trans) »
(**double espace**) ; « Budget  Validé PDSI … » (Charge (Res) (J), Coût
(Res), Coût (Trans), « Total coût » — **casse minuscule**) ; Budget RDLI
Charge (Res) (J) / Coût (Trans) / Total Coût (Res+Trans) (**pas de
« Coût (Res) » RDLI**) ; Coût final/réel ME (Res.+Trans) / (Trans) / (Res),
Charge finale/réelle ME (Res) (J) · Créateur · Référence active (Réf.) ·
**Jalon en cours** · Top projet · Catégorie · Date création · CAT ·
Projet.Actif · Date d'export.

**`Ressources_PdC.csv`** (le plan de charge ; 920 Ko) — colonnes :
**Matricule · Ressource · Organisation · Métier · Id Projet · Nom Projet** ·
Type projet · Portefeuille · **2023 → 2030, chaque année suivie d'une
colonne vide** (le motif attendu des en-têtes fusionnés
prévisionnel/réel — l'aplatissement CSV laisse la 2ᵉ sous-colonne sans
libellé) · Total Prév. · Total Réel · « Etat du processus » (**sans
accent**, vs « État … » dans Projets) · Date de publication · Projet.Actif ·
Date export. Conforme au relevé anticipé ; Q7 confirmée et étendue
(2023→2030).

**`SP_total.csv`** (290 Ko) — la première ligne non vide est un **préambule
de filtres** (« Afficher les montants calculés pour : », « Toute période »,
« Afficher les lignes sans montants : », « FAUX », note « (*) : Montant ne
tenant pas compte de l'année sélèctionnée. » — sic) : l'étape 2 cherche la
ligne d'en-têtes sous le préambule. Colonnes réelles (relevées sur pièce,
Q17 tranchée 2026-07-29) : Notes · Menu · **Nom** · **Type** ·
Score criblage · Priorité · Top projet · Responsable 1 ·
**État suivant autorisé** (candidat Q1) · Catégorie · **Début** ·
**Jalon RVSR ou Fin** · **Jalon RDLI validé** ·
**Jalon RDR validé (Réf.8)** · **Jalon RDR prévisionnel** ·
Budget présenté PDSI · **« * Budget validé RDLI »** (astérisque en tête,
renvoi à la note du préambule ; export fait en « Toute période » donc
montants complets) · « * CAT global projet » · **Coût prév (ME)** ·
**Coût réel** · ME Achats · **Engagé Achats** · Réel Achats ·
« Budget validé PDSI » (24ᵉ colonne, constatée au passage réel du
2026-07-30 — ignorée connue).
Pas de colonne ID : le code est bien embarqué dans le Nom (conforme).

**`CORRESP.csv`** (3 038 o, utf-8 — abandonné, pour mémoire) — colonnes :
« Organisation » ; « Domaine (Orga) » ; « Sous-domaine (Orga) ». C'est le
vocabulaire organisation que porte aussi la colonne « Domaine » de
`Projets.csv` (Q16 : ignorée).

**Leçons pour les contrats** : normalisation indispensable (accents
inconsistants entre fichiers, doubles espaces, casse variable, point final,
libellés dupliqués) — déjà couverte par `normalizeLabel` + écarts
« dupliqué » ; l'arbitrage « l'en-tête le plus juste gagne » est né de ce
passage (Projets.csv porte Domaine+Nom et volait le contrat RDOM).

## Relevé de structure à faire sur pièce (sans rien transférer)

Pour chacun de `SP_total`, `projet`, `ressources_PDC`, l'auteur relève sur
le fichier réel (dicté/recopié à la main — jamais le fichier lui-même) :

1. Nom exact de l'onglet utile ; nombre et noms des autres onglets.
2. Numéro de la ligne d'en-têtes (lignes de titre/vides au-dessus ?).
3. Libellés **exacts** des colonnes, dans l'ordre, recopiés tels quels
   (fautes et espaces compris).
4. En-têtes sur une ou deux lignes (années fusionnées au-dessus de
   prévisionnel/réel ?).
5. Cellules fusionnées dans les données ? Lignes de sous-totaux insérées ?
6. Un nombre tel qu'affiché (virgule ? espaces de milliers ?) et une date
   telle qu'affichée.
7. Le contenu type d'une cellule jalon : date, « oui »/« x », ou vide.
8. Pour `ressources_PDC` : la liste des valeurs **distinctes** de la
   colonne Métier (libellés de rôles, sans donnée personnelle), préfixes
   compris.

Avec ce relevé, les squelettes synthétiques sont fabriqués sur la machine
de l'auteur et servent de fixtures au parseur ; le contrat d'en-têtes fait
office de vérification sur site.

## Questions tranchées (2026-07-29)

- **Q2** — RDR validé → **Exploitation**. Le tableau arbitre le milieu du
  flux ; Done n'est pas dérivé de l'export.
- **Q7** — Les colonnes 2026 existent bien dans `ressources_PDC`.
- **Q5 (partie jointure)** — Pas d'ID fiable dans `SP_total` : **le nom
  fait foi**, le code est récolté + contrôle croisé (voir Règles).
- **Q13** — Entrée en **CSV** (procédure d'export figée côté PMO, voir
  Pièges) ; pas de bibliothèque `.xlsx`, rien à valider au plafond SBOM.
- **Q4 + Q5** — Une seule table `RDOM` (domaine ↔ nom de famille, composée
  par l'auteur, hors dépôt) sert aux deux : le **domaine** se lit sur le
  responsable de portefeuille de `projet` rapproché par nom (`CORRESP`
  abandonné), et la même liste **exclut les RDOM** des responsables 1/2/3
  pour dégager le chef de projet.
- **Q16 (ex-question, tranchée 2026-07-29)** — La colonne « Domaine » de
  `Projets.csv` reste **ignorée** : son vocabulaire est celui de
  l'organisation (celui que `CORRESP` aurait dû traduire). Source du
  domaine confirmée : la colonne réelle **« Responsable portefeuilles »**
  (pluriel, relevé réel) → table `RDOM`.
- **Q17** — Ligne d'en-têtes réelle de `SP_total.csv` relevée sur pièce
  (voir Relevé réel) ; le préambule de filtres est au-dessus, l'étape 2
  cherche la ligne d'en-têtes parmi les premières lignes du fichier.
- **Ordre de construction** — parseur livré par étapes : `RDOM` →
  `SP_total` → `projet` → `ressources_PDC` ; un rapport à chaque passage,
  inventaire des fichiers en tête de rapport (voir Construction par étapes).

## Questions ouvertes

| # | Question | Avec qui |
|---|---|---|
| Q1 | Position amont — **cadré par l'auteur (2026-07-30)** : RDLI passée → Actifs ; le reste réparti entre **Demandes et Études** (pas tout en Demandes). Reste à fixer le critère de partage Demandes/Études — candidat pressenti : « État suivant autorisé » (`SP_total`), valeurs réelles à relever au rapport | Auteur + PMO |
| Q3 | Canal : défaut unique, seuil (coût prévu ?), ou affectation manuelle post-import ? | Auteur + PMO |
| Q6 | Date de début → `createdAt` ? | Auteur |
| Q8 | Unité des valeurs du plan de charge : jours ? (cohérence avec 200 j/an) | PMO |
| Q9 | Signification des préfixes métier (« Externe. », société) : interne/externe ? À conserver un jour ? | PMO |
| Q10 | Jalon RVSR : ignoré définitivement ou conservé quelque part ? | Auteur |
| Q11 | Date du jalon RDLI comme date d'entrée en Actifs dans le journal (âge vrai des cartes importées) ? | Auteur |
| Q12 | Réel > prévisionnel : assouplir la contrainte `done ≤ jh` du modèle (`ChargeEntry`) avant l'import ? | Auteur |
| Q14 | Projet de `SP_total` sans ligne dans `projet` (domaine/chef inconnus) : carte créée avec placeholders ou écartée ? | Auteur |
| Q18 | **Périmètre d'import** : le premier passage réel (2026-07-30) donne **1 095 sujets** (Demandes 914 · Actifs 84 · Exploitation 97) pour un tableau conçu pour ~150 cartes. **Précision de l'auteur (2026-07-30)** : l'identité projet = titre unique — or les 1 095 sont déjà dédupliqués par titre normalisé (46 douteux seulement) : l'inflation vient donc de l'historique (clos/abandonnés) ou de noms variants. Critère d'exclusion à trancher — candidats : « Projet.Actif » (`Projets.csv`, `Ressources_PdC`), « État du processus » (`Projets.csv`) ; le profil `SP_total` du rapport (code PE / type / budget / date en n/total) doit montrer la frontière | Auteur + PMO |
| Q15 | Sémantique du jalon RDLI : la date peut-elle être future (prévue, pas passée) ? Règle : ≤ aujourd'hui pour valoir Actifs ? | PMO |
