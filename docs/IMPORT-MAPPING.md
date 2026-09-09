# Spécification du mapping d'import — exports PPM (Sciforma)

> Document de travail, préparé avec le PMO. Version du 2026-07-29,
> **révisée le 2026-09-04** (retours PMO — la révision, en tête, prime sur
> tout ce qui la contredit plus bas ; les sections de juillet sont
> conservées comme historique des décisions).
> Contrat de l'adaptateur `csv-import` (phase RP4). Évoluera au fil des
> séances d'analyse des exports ; les questions ouvertes sont en fin de
> document. L'ADR de l'adaptateur sera rédigé au moment de sa construction.

## Révision 2026-09-04 — retours PMO : le classeur de consolidation

Séance PMO du 2026-09-04. Deux constats de terrain déclenchent la révision :
les budgets affichés étaient **pluriannuels** (« Coût final ME » du
consolidé cumule toutes les années — d'où des sommes énormes) alors que le
tableau veut le **2026** ; et le PMO (Serge) a produit une **table de
correspondance** (onglet `PARAM`) qui rend la table `RDOM` composée à la
main inutile. Le PMO livre désormais un **classeur de consolidation** dont
les onglets remplacent les exports bruts. Décisions de l'auteur :

**R1 — Sources.** Le classeur est converti sur la VM en **un CSV par
onglet** par LibreOffice (`soffice --headless --convert-to csv:…:-1`,
UTF-8, `;` — commande à valider au premier passage puis inscrite au
RUNBOOK). Onglets lus : **`PARAM`**, **`Projets`**, **`ProjetsJalons`**,
**`SP_2026`**. `TE_Activites` : ignoré (retiré de l'export).
`Ress.Profils` : **lu depuis le 2026-09-07** (ADR 024) — personnes de la
DSI (domaine Orga, métier, Int/Ext, disponibilité) ; Email et Coût jamais
lus (cf. « `Ress.Profils` — structure et mapping »).
Le plan de charge reste le CSV séparé **`Ressources_PdC`**, inchangé
(l'onglet PdC de l'export n'a pas encore les bonnes informations).
*Remplace* : « le consolidé contient tout » (2026-07-31) et le registre
`RDOM` / `SP_total` / `projet` — ces contrats sont retirés du registre
(un fichier qui y correspond est inventorié « contrat retiré »).

**R2 — Périmètre.** Les lignes du CSV **`projets` SONT le périmètre** : le
PMO garantit qu'il ne contient que les projets 2026 des types retenus.
Plus aucune exclusion par « Domaine (Ptf) » ni par `isProjetSIS`. Le
parseur contrôle malgré tout le type (R3) et signale tout écart — jamais
d'exclusion silencieuse.

**Élection du périmètre (2026-09-09).** Quand plusieurs fichiers ont la
forme Projets (Id, Nom, Type, État du processus), le périmètre est celui
**sans** colonne « Responsable 1 » : l'onglet Projets du PMO n'en porte
jamais, l'export complet qui en porte est la source ProjetsCdP (en
septembre, 1 357 lignes contre 138 — l'ancienne règle « en-tête le plus
propre » l'avait élu). À égalité : le fichier qui porte « Domaine (Orga) »,
puis le moins d'écarts d'en-têtes, puis le nom. Les autres candidats sont
signalés douteux avec la raison ; la ligne « périmètre » de l'état
d'assemblage nomme le fichier élu.

**Titre de la carte (2026-09-09).** Le « Nom » Sciforma répète souvent
l'Id en tête (« PX4520155 - Modernisation atelier ») : le titre de la
carte est le nom **sans** ce code de tête (crochets et séparateurs
tolérés ; un nom réduit au code est gardé tel quel), pour que
l'interrupteur « Codes projet » du panneau latéral montre ou cache
vraiment le code. Le nom brut reste la clé des jointures par nom (SP,
PdC).

**R3 — Types.** Clé = colonne **« Type »** de `projets` (pas « Type Gpe »,
pas SP_2026). Le suffixe parenthésé est retiré avant comparaison —
« (Projet) », « (Opportunité) », « (Run) » ne distinguent rien. Quatre
types retenus → `typeId` : **Etude** → `etude` ; **Projet de gestion
d'obsolescence** → `obsolescence` ; **Projet de mise en oeuvre** →
`mise_en_oeuvre` ; **Projet IA** → `ia`. Libellés exclus connus (signalés
s'ils apparaissent) : Achat, Evolution - TMA, TMA Corrective. Tout autre
libellé → douteux. La config `types` ne porte plus que ces quatre.

**R4 — Domaine et sous-domaine : le vocabulaire Orga.** Le domaine de la
carte = **« Domaine (Orga) »** (10 valeurs : A&D, CORPORATE, ERP,
INDUSTRIE, INFRA, ING, IT4IT, PLM, SOUTIEN, SUPPORT OFFICE — la config
`domains` devient cette liste). Le sous-domaine = **« Sous-domaine
(Orga) »** (écrit « Ss-Daine (Orga) » dans l'onglet consolidé) ; il n'est
**retenu que pour A&D** (ARCHITECTURE APPLICATIVE, DATA WAREHOUSE & BI,
DEVELOPPEMENTS RAPIDES, FORGE LOGICIELS) **et CORPORATE** (ACHATS,
COMMERCES & MARKETING, COMMUNICATIONS & RELATION ETATIQUE, FINANCES &
JURIDIQUES, INNOVATION & TRANSFORMATION DIGITALE, MANAGEMENT & PROGRAMME,
QUALITE, RESSOURCE HUMAINE, STRATEGIE ; une ligne CORPORATE sans
sous-domaine existe) ; ailleurs il est replié dans le domaine (non
stocké). **Deux chemins prévus** : si `projets` porte les colonnes Orga,
lecture directe, `PARAM` ne fait que valider ; sinon, traduction du chemin
d'organisation Sciforma (colonne « Domaine », ex. « DSI NEXTER.… ») par la
table ORGA de `PARAM`. Le rapport dit quel chemin a servi ; les inconnus
sont douteux. *Remplace* : domaine via « Responsable portefeuilles » ×
`RDOM` (Q4/Q5) et Q16 (« Domaine » ignoré). La table ORGA de `PARAM` est
l'ex-`CORRESP.csv`, revenu par la grande porte.

**R5 — Contrat `PARAM`.** Un seul onglet, **quatre tables côte à côte**
(ligne 1 = titres, ligne 2 = en-têtes) : DOMAINES (Domaine, Responsable) ;
CORRESPONDANCE ORGANISATION (Organisation, Domaine (Orga), Sous-domaine
(Orga), Responsable) ; CORRESPONDANCE PORTEFEUILLE (Domaine (Ptf), Sous
domaine (Ptf), Responsable) ; PROJETS VENDUS ; Projets SIS. Le parseur
repère chaque table par ses en-têtes de ligne 2 (plage de colonnes) et lit
vers le bas jusqu'au vide. Lues : DOMAINES et ORGANISATION. Ignorées
connues : PORTEFEUILLE, PROJETS VENDUS, Projets SIS. Les colonnes
Responsable contiennent des **noms** : clés de jointure et d'exclusion sur
la machine d'exécution, **jamais stockées** (même règle que `RDOM`).

**R6 — Chef de projet.** Principe inchangé, source simplifiée : l'onglet
consolidé `Projets` porte lui-même Responsable 1/2/3 ; `owner` = le premier
qui n'est **pas** un responsable de domaine (colonne Responsable de la
table DOMAINES de `PARAM`), exclusions comptées. L'export brut `projet`
n'est plus nécessaire (Q20 sans objet).

**R7 — Position initiale : `ProjetsJalons`.** Jointure par Id (nom en
contrôle). Un jalon est franchi quand sa **date** (colonnes **« RDO »**,
**« RDLI »**, **« RDR »**) est passée au jour de l'audit (auteur,
2026-09-08) ; la cellule « … franchi » (o/n) ne décide qu'à défaut de date,
et un désaccord date / franchi est signalé. Règle ordonnée : RDR franchi →
**Exploitation** ; sinon RDLI franchi → **Actifs** ; sinon RDO franchi →
**Études** ; sinon **Demandes**. « Prêts » n'est jamais dérivé (ne se sait qu'à l'oral).
Les colonnes « (Statut) », « Jalon en cours », « Next jalon » sont relevées
au rapport. *Remplace* : Q19 (« Jalon en cours ») et les jalons datés de
`SP_total`. Cibles toujours ancrées sur la config, jamais un id en dur.

**R8 — Budgets 2026 : `SP_2026`.** Jointure par **Id** (SP_2026 en a un,
contrairement à SP_total ; nom en contrôle croisé). « Coût prév (ME) » →
`budgetEstimated` ; « Coût réel » → `budgetConsumed` ; « Engagé Achats » →
`budgetEngaged`. « Réel Achats » non retenu. Unités écrites dans les
cellules : lues et signalées comme avant. *Remplace* : « Coût final ME
(Res.+Trans) », « Coût réel ME (Res.+Trans) » et « Engagé 2026 (Trans) »
du consolidé (2026-07-31), qui ne sont plus lus.

**R9 — Registre des contrats (priorité, du plus spécifique au plus
générique).** `param` → `projets` (consolidé) → `projets_jalons` →
`sp_2026` → `ressources_pdc`. Le modèle d'invocation ne change pas :
sans état, un rapport à chaque passage, inventaire en tête.

**R10 — Conséquences config / UI.** `config/board.json` : `domains` = les
10 domaines Orga, avec un champ `subDomains` sur A&D et CORPORATE ;
`types` = les 4 types. Sidebar : le groupe « Type de projet » ne montre
que ces quatre ; le groupe domaine gagne un **chevron** à gauche de A&D et
de CORPORATE qui déplie leurs sous-domaines, sélectionnables un à un (un
domaine coché = tous ses sous-domaines). La carte gagne un `subDomain`
optionnel. Modélisation à formaliser par ADR au moment de la construction.

**Implémenté (2026-09-07, ADR 023).** Registre `param` → `sp` →
`projets_jalons` → `projets` → `ressources_pdc`, RDOM conservé comme
contrat retiré (inventorié, jamais lu). `PARAM` : tables DOMAINES et
ORGANISATION repérées par leurs en-têtes de ligne 2, chemin d'organisation
lu dans la colonne sans en-tête à gauche de « Domaine (Orga) » ; les
responsables de domaine deviennent des listes de mots (exclusion par mots
entiers, matricules ignorés). `projets` : reconnu par Id + Nom + Type +
État du processus (les deux formes) ; type par liste blanche des quatre
(suffixe retiré), inconnu gardé et questionné ; sous-domaine résolu
seulement dans A&D et CORPORATE, replié ailleurs et compté.
`projets_jalons` : dates RDO / RDLI / RDR ≤ jour de l'audit = franchi ; à
défaut, « franchi » : VRAI / oui / o / x / 1 / date = franchi (date future
signalée), FAUX / non / n / 0 / vide = non ; valeurs brutes relevées (Q21).
`sp` : Nom + trois coûts requis, Id optionnel (jointure Id > nom > code
PE) ; **montants en euros convertis en k€** et signalés, k€ ou sans unité
pris tels quels. Q22/Q23 : statu quo, dit dans la ligne « coûts 2026 (SP) »
du rapport. Squelettes synthétiques dans `fixtures/import/` (PARAM,
Projets, ProjetsJalons, SP_2026, Ressources_PdC).

**Questions ouvertes nées de la révision** (ne pas inventer) :

| # | Question | Avec qui |
|---|---|---|
| Q21 | Sémantique des cellules « RDO/RDLI/RDR franchi » : date, oui/x, booléen ? Et « (Statut) » ? — à verrouiller par l'audit | PMO |
| Q22 | Charge j.h de la carte (`effortEstimated` / `effortConsumed`) : « Charge finale/réelle ME (Res) (J) » du consolidé sont pluriannuelles comme les coûts ; source 2026 à désigner (« Réel 2026 (Res)(J) » existe, pas d'estimé 2026 en jours) | Auteur + PMO |
| Q23 | Enveloppe RDLI (`budgetRdli`) : garder « Budget RDLI Total Coût (Res+Trans) » du consolidé ou passer à « * Budget validé RDLI » de SP_2026 ? | Auteur |

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

**Révision 2026-07-30 (Q18)** : un export **« projet consolidé »**, fichier
maître du périmètre, s'intercale — ses lignes sont les cartes retenues ;
`SP_total` et `projet` deviennent des enrichissements joints par nom ;
hors-consolidé = hors board (écarté, compté). L'étape 3 révisée porte le
contrat du consolidé + les jointures d'enrichissement.

**Révision 2026-07-31 (auteur)** : simplification finale — le consolidé
(déposé sous le nom `Projets.csv`, 185 lignes) **contient tout sauf le
plan de charge** et devient la **source unique des cartes** ; les exports
bruts `SP_total` et `projet` sortent du circuit. Le parseur prend tout ce
qu'il peut du consolidé, puis utilise `RDOM` (domaine de repli, exclusion
du chef) et `ressources_PDC` (étape 4) au besoin. En-têtes réels du
consolidé à verrouiller (recopie de la ligne 1 attendue).

**En-têtes réels verrouillés (2026-07-31, 53 colonnes dictées par
l'auteur)** — mapping consolidé → carte décidé le même jour :
« Nom » → titre + clé ; « Id » (PE) → `codename` ; « Domaine (Ptf) » →
`domain` (vocabulaire board, tolérant, inconnus signalés) ; « Type » →
`typeId` ; « Début » → `createdAt` ; « Fin » → `dateRdr` ;
« Budget RDLI Total Coût (Res+Trans) » → `budgetRdli` ;
« Coût final ME (Res.+Trans) » → `budgetEstimated` ;
« Coût réel ME (Res.+Trans) » → `budgetConsumed` ;
« Engagé 2026 (Trans) » → `budgetEngaged` ;
« Charge finale ME (Res) (J) » (repli « Charge JH ») → `effortEstimated` ;
« Charge réelle ME (Res) (J) » → `effortConsumed` ;
« Jalon en cours » → relevé des valeurs
(**Q19** : règle de position à dicter — d'ici là, tout en Demandes) ;
« Complexité du projet » → relevé (candidat canal). Familles PDSI/ME/2026
restantes : ignorées connues (matière étape 4).

**Corrections du 2026-07-31 (constatées sur le passage réel)** :
- **« isProjetSIS » ne discrimine PAS** — SIS = Système d'Information du
  **Soutien**, hors DSI ; le drapeau est purement **informatif** (compté
  VRAI/FAUX au rapport). **Le périmètre = être une ligne du fichier
  consolidé, point.** (L'inversion initiale écartait les ~159 vrais
  projets.)
- **Chef de projet : Q20 fermée le 2026-08-01** — vérification faite sur
  les vrais fichiers, le consolidé **n'a pas** de colonnes Responsable
  (chef de projet 0/148 au rapport). Le **contrat `projets` (export brut)
  revient au registre** : il est la **seule source du chef de projet**.
  Le consolidé reste le périmètre et la source des valeurs ; l'export brut
  n'apporte que l'`owner` (premier des Responsables 1→3 qui n'est **pas**
  un RDOM, exclusions comptées) et le domaine de repli via « Responsable
  portefeuilles ». Ses lignes ne deviennent **jamais** des cartes ;
  jointure par nom puis titre.
- **Priorité des contrats = ordre du registre** (du plus spécifique au plus
  générique : consolidé, projets, SP_total, PdC, RDOM). Un fichier qui
  correspond pleinement à plusieurs contrats prend le premier — le
  consolidé ne peut plus être pris pour l'export brut même s'il gagnait un
  jour des colonnes Responsable, et RDOM (2 colonnes très génériques) ne
  peut plus rafler un export riche.
- **Le « Pris » du rapport = les cartes** (une ligne par carte assemblée) ;
  `SP_total`, s'il est présent, comble les trous en silence (ses sujets ne
  sont plus listés, les hors-périmètre restent comptés).
- **Q19 tranchée (auteur, 2026-07-31)** — « Jalon en cours » = le
  **prochain jalon attendu** : RDO → **Qualification** ; RDLI → **Études**
  (RDO passée) ; RDR → **Actifs** (RDLI passée) ; RVSR → **Exploitation**
  (RDR passée) ; vide ou inconnu → **Demandes** (inconnus signalés).
  Priorité : jalons datés de `SP_total` s'il est présent > « Jalon en
  cours » > Demandes. Cibles ancrées sur la config (qualification =
  ancre, études par id avec repli, actifs = ancre d'activation,
  exploitation = dernière colonne).
  **Complément (auteur, même jour)** : les libellés réels relevés
  (« Début T0 », « Go Live », « RDR Revue de réception », « Fin de
  projet ») ne sont **pas** mappés — « sans infos, mets en Demandes » ;
  la table RDO/RDLI/RDR/RVSR reste en place, inactive sur ces valeurs.
- **Q3 tranchée (auteur, 2026-07-31)** — Canal : **toutes les cartes
  importées entrent dans le canal « Projets » (compliqué)** — la colonne
  « Complexité du projet » n'a **rien à voir** avec le canal (gardée en
  simple relevé informatif). Le canal cible = la lane de `natureKey`
  « complicated » de la config, jamais un id codé en dur.
- **Exclusions de périmètre (auteur, 2026-07-31)** — les lignes dont
  « Domaine (Ptf) » vaut **« TMA CORRECTIVES »**, **« IT4IT »** ou
  **« PROJETS VENDUS »** (pas arbitrables) sont écartées du board
  (écartées avec raison, comptées dans la ligne périmètre).

**Modèle d'invocation : sans état caché.** À chaque exécution, le parseur
lit le dossier d'entrée, prend les fichiers reconnus qui s'y trouvent,
refait l'assemblage complet et produit le rapport. On ajoute les fichiers
au fur et à mesure ; chaque passage redonne l'inventaire et l'état du
recollage (« domaine : en attente du fichier `projet` »). Idempotent,
re-jouable, rien à mémoriser entre deux exécutions.

## Fichiers sources

> **Révision 2026-09-04** : ce registre est remplacé par R1/R9 en tête
> (onglets du classeur de consolidation) ; conservé comme historique.

| Fichier | Contenu | Rôle |
|---|---|---|
| `SP_total` | Les sujets/projets : identité, type, jalons, budgets | Source principale des cartes |
| `projet` | Organisation : portefeuilles, responsables 1/2/3, responsable de portefeuille | Domaine + chef de projet |
| `RDOM` | Table domaine ↔ nom de famille du/des RDOM (2 colonnes : domaine, nom ; une ligne par nom, un domaine peut en avoir plusieurs). Double usage : domaine via le responsable de portefeuille, ET liste d'exclusion pour le chef de projet | Composé par l'auteur, CSV côté client, **hors dépôt** (noms réels) |
| `consolidé` | **Fichier maître du périmètre** (Q18) : une ligne = un projet retenu = une carte. Les autres fichiers l'enrichissent par jointure de nom. Nom réel du fichier et structure à relever au premier passage | Export PMO consolidé |
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
| Matricule | **Discriminant nominatif** : rempli = ligne personne, vide = ligne générique. Jamais stocké en clair : haché en id opaque `p-…` (ADR 024) et joint à `Ress.Profils` (« Id » ou « pk Contact ») |
| Ressource | Nom de la personne (si nominatif), ou libellé générique/rôle. Les rôles exotiques (ex. « Concepteur développeur Low Code ») ne bloquent pas : le profil vient de la colonne Métier ; signalés au rapport |
| Organisation | Ignorée (le domaine vient de `projet` + table `RDOM`) |
| Métier | → **profil DSI** (`profileId`). Liste blanche des 19 profils, normalisation : casse, espaces, points, retrait des préfixes (« Externe. », noms de société type « Nexter. »). Préfixes rencontrés listés au rapport (signification à confirmer, Q9) |
| ID projet | Toujours rempli, semble-t-il. Récolté comme `codename` + **contrôle croisé** avec la jointure par nom (désaccord = drapeau) |
| Nom projet | **Clé de jointure** (le nom fait foi, stable entre fichiers) |
| Type projet, Portefeuille | Ignorés (redondants) |
| Années 2023, 2024, 2025(, 2026 — Q7), chacune en 2 colonnes prévisionnel / réel | **Seule l'année d'exercice est lue** (`exercise.year` de la config, 2026) : prévisionnel → `jh` (planifié), réel → `done` (consommé). Unité attendue : jours (Q8) |
| Total (pluriannuel) | Ignoré |

**Agrégation** : les lignes d'un même projet × métier (× personne) sont
sommées — jamais supposées uniques. Les fusions (variantes de préfixe, etc.)
sont tracées au rapport.

**Implémenté (étape 4, 2026-07-31)** : contrat `ressources_pdc` (requis :
Matricule, Ressource, Métier, Nom Projet, « 2026 ») ; la sous-ligne
Prév./Réel est détectée et consommée (appariement par position signalé si
absente) ; Métier → profil par liste blanche tolérante, préfixe pointé
décollé (« Externe. », sociétés) et **relevé** (Q9 à confirmer) ; métier
inconnu ou vide → seau « non attribué », questionné ; réel > prévisionnel
**conservé et signalé** (Q12 appliquée) ; lignes de total exclues ;
jointure sur les cartes nom > code (« Id Projet ») > titre ; consolidation
nominative au rapport (top 15, j.h/200 → taux ETP) — les noms restent sur
la machine d'exécution.

**Révision 2026-09-07 (ADR 024)** : la colonne d'année du contrat vient de
`exercise.year` (`pdcContract(year)`) — plus d'année en dur ; chaque projet
conserve ses lignes nominatives (matricule → jh/réel) pour les
affectations de la table capacité (section suivante).

## `ProjetsCdP` — chefs de projet (révision 2026-09-08)

L'export Projets d'août porte les colonnes Responsable vides sur toutes les
lignes. Le PMO produit un fichier séparé à partir de la même liste (le
périmètre fait foi) : **Id ; Nom ; Responsable 1 ; Responsable 2 ;
Responsable 3**. Un export Projets complet portant les Responsable convient
aussi, quel que soit son nom : il est lu comme ProjetsCdP, et le périmètre
reste le fichier **sans** colonnes Responsable (R2, 2026-09-09 — signalé
dans les douteux). Contrat `projets_cdp` : requis Id,
Responsable 1 ; optionnels Nom, Responsable 2, Responsable 3. Même règle
que Projets (R6) : le chef de projet est le premier Responsable qui n'est
pas un responsable de domaine de PARAM. Jointure par Id (le code de la
carte), puis par nom ; seules les cartes **sans** chef de projet en
prennent un ; les lignes hors périmètre sont comptées. La ligne « chef de
projet » de l'état d'assemblage dit « dont N via ProjetsCdP ».

## `Ress.Profils` — structure et mapping (ADR 024, 2026-09-07)

Une ligne = une personne de la DSI (interne ou externe). Onglet du classeur
de consolidation, converti en CSV comme les autres ; en-têtes en ligne 2
(ligne 1 vide) — la recherche d'en-têtes l'absorbe.

| Colonne | Usage |
|---|---|
| pk Contact, Id | **Matricule** (l'un ou l'autre, les deux acceptés) : clé de jointure avec « Matricule » du plan de charge ; haché en id opaque `p-…`, jamais stocké en clair (Q26) |
| Nom de famille, Prénom | Nom affiché (« Prénom NOM ») — porté par la table capacité, jamais par le journal |
| Int/Ext | Externe si la cellule dit « Externe » / « Ext… » / oui (Q25) |
| Domaine (Orga), Sous-domaine (Orga) | Domaine / sous-domaine de la personne (mêmes règles que `projets`, ADR 022) ; inconnu → douteux, personne sans domaine |
| Métier | → profil DSI (liste blanche tolérante, préfixe pointé décollé) ; inconnu → douteux |
| Profil, Statut | Optionnels, non lus pour l'instant (Statut : candidat filtre « actif ») |
| Disponibilité | Capacité de l'exercice, **en jours** (export d'août : 200 pour la plupart, 218 pour quelques-uns) ; **0 = capacité non déclarée** (56 personnes en août — non comptées, signalées) ; entre 0 et 5 → ETP × 200 j.h (signalé) ; vide ou illisible → inconnue (Q24 : reste la fenêtre, annuelle ou résiduelle) |
| Email, Coût | **Déclarés ignorés — jamais lus, jamais stockés** |

**Assemblage** (`adapters/csv-import/capacity.ts`) : personnes = fiches
Profils ; affectations = lignes nominatives du PdC des projets joints aux
cartes (une par personne × carte, prévisionnel / réel de l'exercice) ;
personne du PdC sans fiche → **stub** (nom, capacité inconnue), signalé.
Chaque personne porte aussi son **projeté** et son **réalisé** sur tout le
plan de charge (toutes lignes à son matricule, périmètre ou non — ADR 028) ;
toute personne du PdC sans fiche devient un stub, pour que les totaux
soient ceux de la DSI entière. Ligne « capacité » de l'état d'assemblage :
personnes, externes, capacité, sans fiche, affectations, demande du
tableau, projeté et réalisé sur tout le plan de charge, hors plan de
charge. Enregistré par `--charger` (table `capacity`, remplacée entière —
ADR 024), servi par `GET /api/capacity`.

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

## Chargement réel (décisions auteur, 2026-08-01)

**Révision 2026-09-08 (ADR 026) — rien n'est écrasé.** Une carte importée
(`source: csv`), non archivée, absente du nouvel export reçoit un évènement
`unlisted` (acteur `import-csv`) et reste sur le tableau avec le marqueur
« ∅ » ; à son retour dans un export, `relisted`. Les cartes créées à la
main ne sont jamais marquées. L'année lue est `exercise.year` ; la clôture
d'exercice (`sync/cloture.ts`) archive les étapes terminales et passe
l'année suivante.

Le mode audit reste le défaut ; l'écriture dans le board demande le
drapeau explicite `--charger` (`node sync/import.ts <dossier> --charger`).

- **Âge des cartes** : le compteur d'âge démarre à la **date de début du
  projet** (« Début ») — l'évènement `imported` est daté ainsi ; à défaut,
  l'instant de l'exécution.
- **Ré-import** : **met à jour les cartes existantes, ajoute les
  nouvelles**. Identité stable = le **code PE** quand il existe, sinon un
  identifiant dérivé du nom normalisé (`IMP-…`) ; un renommage sans code
  crée donc une nouvelle carte — le contrôle croisé des codes le signale
  en amont.
- **Règle de conflit** : l'**export gagne sur les faits** (budgets,
  charge, domaine, chef de projet, dates, type — vérités Sciforma) ; le
  **tableau gagne sur la position** dès qu'un humain a déplacé la carte à
  la main (l'arbitrage est celui du PMO) — la divergence est alors
  **signalée**, jamais écrasée. Une carte que personne n'a bougée suit
  l'export (évènement `moved` d'acteur `import-csv`).
- Les champs que les exports ne portent pas (tags, risques, contraintes,
  blocage, notes, ressources) restent vides : ils se vivent dans l'outil.
  Une édition faite dans l'outil (`edited`) prime sur le rafraîchissement
  de la ligne d'import — c'est la logique du journal, assumée.

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

## Module nominatif : construit comme table de capacité (ADR 024, 2026-09-07)

Direction de 2026-07-29, **réalisée autrement** : les personnes ne vont
ni dans la config ni dans `ChargeEntry`, mais dans une **table de faits
`capacity`** (`persons` + `assignments`), remplacée entière à chaque
import ; les agrégations par profil des cartes sont inchangées ; la vue
capacité (panneau analytics) se construit sur `core/capacity.ts`. Les
principes ci-dessous restent vrais (noms hors journal, matricule → id
opaque, 200 j.h = 1 ETP) :

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
Constats du passage réel complet (2026-07-30, 1 095 sujets) : les
**unités sont écrites dans presque toutes les cellules de coût**
(« Coût prév (ME) » : 1 091/1 095) — c'est la norme de cet export ;
« Type » porte une douzaine de valeurs numériques isolées (1 sujet
chacune — cellules décalées ou codes résiduels, signalées) et le libellé
« RUN (Projet) » (correspondance à trancher) ; 3 jalons incohérents,
4 RDR validés futurs, 1 coût négatif — tous signalés.

**`CORRESP.csv`** (3 038 o, utf-8 — abandonné, pour mémoire) — colonnes :
« Organisation » ; « Domaine (Orga) » ; « Sous-domaine (Orga) ». C'est le
vocabulaire organisation que porte aussi la colonne « Domaine » de
`Projets.csv` (Q16 : ignorée).

**`consolidé` — onglet « Projets » de `ExportsConsolidation_xxxx.xlsx`**
(relevé sur photos, 2026-07-30 — libellés partiellement tronqués, à
verrouiller au premier passage CSV) : Id · Nom · **Domaine (Ptf)** ·
Ss-Domaine (Ptf) · Domaine/Ss-Domaine (fonctionnel ?) · Catégorie · Type ·
Type Gpe · **Complexité du projet** (candidat canal/nature) · État du
processus · Priorité. · Score total · Début · Date T0 · Fin · Charge JH ·
familles budgets (Validé PDSI, RDLI, ME finals/réels) · Référence active
(Réf.) · Jalon en cours · Catégorisation · Date d'export ·
**isProjetSIS** (le drapeau de périmètre présumé) · PDSI2026 O/N ·
familles 2026 (ME/Réel/Engagé/RAF/Budg. Res/Trans/CAPEX/OPEX). Le
classeur porte aussi des onglets ProjetsJalons, Ress.Profils, PdC2026 —
matière possible pour l'étape 4. Contrat étape 3 : requis réduit au trio
sûr (Nom, Domaine (Ptf), isProjetSIS), tout le reste optionnel/ignoré —
les extras du rapport verrouilleront les libellés réels.

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
- **Q1 (tranchée 2026-07-30, auteur)** — Position amont : **tout en
  Demandes** faute d'information fiable (« mets tout en Demandes si tu
  n'as pas d'infos »). Valeurs réelles d'« État suivant autorisé »
  relevées au rapport : Nouveau (138) · Budget présenté (382) · Basculé
  en Reporté (11) · Annulé (42) · Budget validé (42) · Fusionné (5), ~475
  vides — un affinage ultérieur reste possible, non requis. Les « Annulé »
  et « Fusionné » rejoignent la question de périmètre (Q18).
- **Q18 (tranchée 2026-07-30, auteur)** — **Le périmètre est porté par un
  export « projet consolidé »**, fichier maître : ses lignes SONT les
  projets retenus. L'assemblage s'inverse : le consolidé devient la source
  des cartes ; `SP_total` (jalons → position, budgets) et `projet`
  (domaine via RDOM, chef de projet) deviennent des **enrichissements
  joints par nom**, puis `ressources_PDC` (charge). Sujet des autres
  fichiers absent du consolidé = **hors périmètre** (écarté, compté) ;
  projet du consolidé sans correspondance = **donnée manquante signalée**.
  Structure du consolidé à relever au premier passage (le rapport
  recopiera ses en-têtes).
- **Ordre de construction** — parseur livré par étapes : `RDOM` →
  `SP_total` → `projet` → `ressources_PDC` ; un rapport à chaque passage,
  inventaire des fichiers en tête de rapport (voir Construction par étapes).

## Questions ouvertes

| # | Question | Avec qui |
|---|---|---|
| Q3 | Canal : défaut unique, seuil (coût prévu ?), ou affectation manuelle post-import ? | Auteur + PMO |
| Q6 | Date de début → `createdAt` ? | Auteur |
| Q8 | Unité des valeurs du plan de charge : jours ? (cohérence avec 200 j/an) | PMO |
| Q9 | Signification des préfixes métier (« Externe. », société) : interne/externe ? À conserver un jour ? | PMO |
| Q10 | Jalon RVSR : ignoré définitivement ou conservé quelque part ? | Auteur |
| Q11 | Date du jalon RDLI comme date d'entrée en Actifs dans le journal (âge vrai des cartes importées) ? | Auteur |
| Q12 | Réel > prévisionnel : assouplir la contrainte `done ≤ jh` du modèle (`ChargeEntry`) avant l'import ? | Auteur |
| Q14 | Projet de `SP_total` sans ligne dans `projet` (domaine/chef inconnus) : carte créée avec placeholders ou écartée ? (portée réduite depuis que le consolidé est la source unique) | Auteur |
| Q20 | **Chef de projet** : absent du consolidé — source à définir (réintroduire l'export `projet`, ajouter une colonne au consolidé, ou saisie dans l'outil ?) | Auteur |
| Q15 | Sémantique du jalon RDLI : la date peut-elle être future (prévue, pas passée) ? Règle : ≤ aujourd'hui pour valoir Actifs ? | PMO |
| Q24 | `Ress.Profils` « Disponibilité » : unité **tranchée par l'export d'août (jours ; 0 = non déclarée)** ; reste la fenêtre (capacité annuelle ou résiduelle ?) | PMO |
| Q27 | Domaines Orga vus dans PARAM / Ress.Profils hors vocabulaire du tableau : « CONTROLE DE GESTION », « ING & PLM » — à ajouter, ou à rattacher à un domaine existant ? | PMO |
| Q28 | `Projets` d'août : « Responsable » vide sur toutes les lignes — l'export peut-il porter le chef de projet ? | PMO |
| Q29 | `SP_2026` d'août : « Engagé Achats » et « * Budget validé RDLI » — **tranchée** : les cellules portent l'unité « ke » (« 400 ke »), lue comme k€ depuis le 2026-09-08 | — |
| Q21 | `ProjetsJalons` — **tranchée par l'auteur (2026-09-08)** : la position vient des **dates** des colonnes RDO / RDLI / RDR, passées ou non au jour de l'audit ; les cellules « franchi » (« o » / « n » dans l'export d'août) ne servent qu'en repli quand la date manque, et un désaccord date / franchi est signalé | — |
| Q25 | `Ress.Profils` « Int/Ext » : valeurs exactes (Interne/Externe ? O/N ?) | PMO |
| Q26 | Matricule joint au plan de charge : « Id » ou « pk Contact » ? (les deux sont acceptés, l'un des deux doit correspondre) | PMO |

**Révision 2026-09-04** : Q14 et Q20 sont sans objet (R2, R6) ; Q3 était
déjà tranchée (canal « Projets ») ; Q15 se reporte sur les colonnes
« franchi » de `ProjetsJalons` (Q21). Nouvelles questions Q21–Q23 en tête
de document.
