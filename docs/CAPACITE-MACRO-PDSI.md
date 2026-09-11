# Note — ce que la macro « Consolidation PDSI » (v0.18.2) nous apprend sur la capacité

Lecture du 2026-09-11 de `Doc_Macro_PDSI_V1.11.txt` (macro Excel VBA d'un
collègue, dashboard BI HTML autonome). Objet : extraire sa logique de
reconstruction de la vision capacité et la confronter à la nôtre (ADR
024/028/029). Aucune décision prise ici — matière à arbitrer par l'auteur.

## 1. Ce que la macro fait pour la capacité

| Élément | Macro PDSI | Kanban (ADR 029) |
|---|---|---|
| **Unité de compte** | le **type de ressource** (« Centre de coût » des lignes « Charge » : CdP CORPORATE, CdP INFRA BUILD, Chef de projet Applicatif…) | la **personne nommée** du plan de charge, agrégée ensuite par domaine et par profil |
| **Source des jours** | export **COUT PREV** : lignes « Type de centre de coût = Charge », jours = « Charge finale ME (Res) (J) », par (projet × type de ressource), pour l'année consolidée | export **PdC 2026** : lignes projet par (ressource × projet), Prév./Réel de l'exercice ; lignes « Disponible ressource » et « Planifiée projet » par personne |
| **Périmètre de la demande** | projets **Retenus** à l'arbitrage + Projets vendus + TMA correctives + exclus manuels (Ballotage et Non retenus exclus) | les **cartes du tableau** (la liste PDSI validée) = « demande du tableau » ; plus le projeté de toute la DSI par personne |
| **Capacité de référence** | 1) **charge réellement portée l'année précédente** par type de ressource (COUT PREV N-1) — base préférée ; 2) à défaut, capacité saisie à la main par type de ressource (Paramètres, j/an) | la ligne « Disponible ressource » de chaque personne (PdC), sommée par domaine / profil |
| **Saturation** | taux = jours / capacité ; > 100 % rouge, ≥ 85 % orange ; « types de ressource saturés », « projets retenus dépendant d'un type saturé » | engagement = projeté / capacité ; surcharge par personne ; reste disponible et surcharge cumulée par groupe |
| **Base ETP** | **210 j/an** | **200 j/an** (`ETP_JH`) |
| **Charge générique** | comptée d'office : le type de ressource EST l'unité, personne ou pas | gardée sur le projet, comptée à part (« non nominatives »), pas encore rattachée au profil / domaine |
| **Réel vs prévisionnel (N-1)** | règle par « État du processus » : Budget présenté / Nouveau → ignoré ; Annulé / Reporté / Terminé / Fusionné → **réel** ; Basculé / Budget validé / vide → **final**. Jamais de cumul final + réel | Prév. et Réel lus tels quels sur chaque ligne |
| **Domaines** | dernier segment du portefeuille ; **regroupement par mots-clés** (Corporate = Achat/Commerce/…/Management/Qualité/RH/Stratégie ; Infrastructure = préfixe ; Production = préfixe ; Ingénierie = préfixe + Système/Munition ; A&D = préfixe « GROUPE ») ; le reste garde son libellé | « Organisation » traduite par le chemin exact de PARAM, repli sur un segment lu comme libellé, sinon Ress.Profils |
| **Croisements** | ressources × domaines ; projets les plus consommateurs ; ratio k€/jour ; comparaison N vs N-1 par ressource (écart, plus forte hausse) | matrice domaines transverses × domaines demandeurs ; cartes qui pèsent ; charge par domaine et par profil |

## 2. Ce qui vaut la peine d'être repris

1. **La demande par type de ressource, générique comprise.** C'est le cœur
   de la vue « Appel de charges » de la macro et exactement ce qui manque à
   notre vue : la charge sans personne nommée (affectations génériques,
   rôles PE22) portée par un **profil** et un **domaine**. Le PdC donne le
   « Métier » et l'« Organisation » de ces lignes : rattacher cette demande
   au profil comme segment **« à pourvoir »** dans « Charge par profil » et
   au domaine dans « Charge par domaine ». Sans code nouveau côté fichiers.
2. **La capacité de référence = ce que la ressource a réellement porté en
   N-1.** Idée forte et peu coûteuse : le PdC porte les colonnes 2023–2030
   (Prév./Réel). Lire le **Réel N-1** par profil (et par personne) comme
   deuxième repère, à côté de la ligne « Disponible » : « capacité déclarée
   vs capacité démontrée ». Rend la surcharge lisible même quand
   « Disponible » manque (1 personne sur 3 dans nos fixtures ; combien sur
   la VM ?).
3. **La règle final / réel selon l'état du processus**, pour toute lecture
   d'une année passée : un projet clos se compte sur son réel, un projet
   engagé sur sa prévision finale, un projet non engagé ne compte pas.
   À appliquer si l'on lit N-1.
4. **Le rattachement des domaines par mots-clés.** Nos types ont déjà des
   `aliases` cherchés dans le libellé ; donner la même chose aux **domaines**
   (« INFRASTRUCTURE » → INFRA, « GROUPE » → A&D, « MANAGEMENT » → CORPORATE
   sans y faire tomber « PROGRAMME ERP / PLM »…) rendrait la traduction de
   « Organisation » robuste aux libellés qui ne sont pas dans PARAM. Les
   pièges déjà résolus par la macro (§9.1 bis) sont à reprendre tels quels.
5. **Le contrat COUT PREV.** L'export que la macro lit n'est pas dans nos
   sept fichiers. L'accepter comme 8ᵉ contrat (Annee ; Projet. ID ; Type de
   centre de coût ; Centre de coût ; Coût final ME ; Charge finale ME (Res)
   (J)) permettrait de **reproduire l'appel de charges du collègue à
   l'identique** et de le **recouper** avec le PdC — deux exports de la même
   réalité, deux chiffres qui doivent se rejoindre. Le désaccord serait
   lui-même une information.
6. **Les seuils** : 85 % tension, 100 % surcharge ; et la base ETP (210 vs
   200) à aligner sur ce que le PMO utilise vraiment.

## 3. Ce qui nous distingue, et qu'on garde

- **La personne.** La macro ne descend jamais sous le type de ressource ;
  nous portons l'engagement nominatif (ADR 028) parce que l'arbitrage entre
  responsables de domaine se joue aussi sur des personnes. Les deux
  lectures se complètent : le type de ressource pour la capacité globale et
  le « à pourvoir », la personne pour la surcharge réelle.
- **Le périmètre.** Sa demande est celle des projets retenus par
  l'arbitrage budgétaire ; la nôtre est celle du tableau, qui EST la liste
  validée. Même chose en pratique, mais sa lecture exclut Ballotage et Non
  retenus — utile si un jour le tableau porte des cartes non retenues.
- **Hors périmètre de l'outil** : l'arbitrage sous flottaison, les paliers,
  les bridges, les slides. Le kanban éclaire, il n'arbitre pas (référentiel :
  le flux est un éclairage, pas une décision).

## 4. Proposition d'ordre, à valider

1. Demande générique rattachée au profil et au domaine (« à pourvoir »).
2. Aliases de domaines par mots-clés, avec les pièges de la macro.
3. Réel N-1 par profil / personne comme capacité démontrée (règle
   final / réel).
4. Contrat COUT PREV en 8ᵉ fichier, recoupement PdC ↔ COUT PREV.
5. Seuils 85 / 100 % et base ETP en config.
