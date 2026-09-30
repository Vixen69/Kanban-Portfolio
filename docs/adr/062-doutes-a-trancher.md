# ADR 062 — Doutes à trancher à l'import

Date : 2026-09-30 · Statut : proposé (branche import-doutes) · Étend les
ADR 055 (rapport lisible), 056 (import déterministe), 058 (jointures,
identités) et 059 (adoption)

## Contexte

L'auteur, le 30 septembre : « quand j'ai des projets douteux pris pour le
périmètre, il faudrait que j'aie une option pour le merge : quelle valeur
on garde, quelle valeur on garde pas ; me dire pourquoi c'est douteux,
est-ce qu'on le prend, est-ce qu'on le prend pas » ; et sur la mémoire :
« tant que tu n'as pas cliqué, on te redemandera… “ne plus me demander”,
pour ce projet-là… je préfère quand même que tu aies le choix ».
Jusqu'ici l'importeur tranchait seul (ADR 056/058) et le disait en
« douteux » : le PMO lisait la règle appliquée sans pouvoir la changer.

## Décision

1. **Les doutes décidables deviennent des questions.** L'audit rend
   `doubts` (`core/import-doubts.ts`) : pour chaque doute, le projet (code,
   titre, carte — « code@année » s'il n'est pas au tableau), la
   **question** (`subject` : « état », « ligne SP »… — un projet peut en
   poser plusieurs), **pourquoi**
   en clair, les **choix** avec leur conséquence (« le projet sort du
   périmètre : état « Budget présenté » hors des états retenus ») et le
   **choix de l'outil**, présélectionné — le comportement d'avant. Six
   sortes : faits COUT PREV en désaccord (état, type, portefeuille, nom) ;
   un Id sur plusieurs lignes (Projets quand il fait le périmètre,
   ProjetsJalons, SP, ProjetsCdP quand les chefs de projet diffèrent) ;
   jointures refusées ou ambiguës par le nom (Jalons, SP, CdP ; ligne SP à
   l'Id contre ligne au nom) ; montant ambigu « 1,035 » en k€ (lecture
   française ou anglaise) ; cellule ME illisible (garder ou écarter) ;
   identité (deux cartes à la main sur un code, adoption sous un autre
   titre, deux projets sur une même carte). Les doutes des fichiers
   annexes ne sont posés que pour les projets du périmètre.
2. **Jamais bloquant.** Charger sans rien toucher applique les choix de
   l'outil. Les autres douteux restent de simples signalements (octets
   parasites, « Année » illisible, portefeuille sans domaine, refus de
   fichiers, capacité et personnes, vocabulaire) ; les conflits de domaine
   gardent leur circuit (ADR 036).
3. **Le journal est la mémoire.** Chaque réponse envoyée au chargement
   devient un événement **`settled`** (nouveau type, écrit dans le même lot
   que le chargement) : qui, quand, le doute, l'option, ses mots (jamais un
   nom de personne ni rien qui en dérive : « ligne 3 » pour un chef de
   projet — voir « Données personnelles »), mémorisée ou non.
   Pas `edited` (il porte un patch lu par les décisions de domaine et les
   corrections à la main), pas `decided` (les décisions D1–D6 de la fiche).
   Le pli du tableau, l'Historique et les indicateurs l'ignorent ; il ne
   masque jamais la naissance d'une carte (`core/fold-order.ts`).
4. **« Ne plus me demander pour ce projet (question) ».** La case vaut
   pour la question où elle est cochée (sauf les doutes qui ne se
   distinguent que par un nom, jamais mémorisés — « Données
   personnelles ») : un projet aux deux questions
   (état et type) se coche deux fois. Sans la case, le choix vaut
   pour ce chargement : la question revient. Avec, il est réappliqué sans
   rien demander tant que le doute est **le même** (même projet, même
   sorte, mêmes valeurs en concurrence — une empreinte) ; un doute changé
   redemande. L'audit le rend « mémorisé » (« Déjà tranchés ») ;
   « Redemander » (`{ forget: true }`) l'oublie, tracé aussi. Une
   restauration (ADR 042) oublie les choix écrits après la position
   restaurée, comme tout événement.
5. **API.** `POST /api/import/audit` et `/load` acceptent `choices`
   (id du doute → `{ option, sticky }` ou `{ forget: true }`) ; une
   option qu'un doute n'offre pas : refus en français (relancer
   l'analyse). Les doutes dépendent les uns des autres (« Budget
   présenté » sort le projet et sa question ProjetsJalons disparaît ; lire
   une autre ligne SP fait disparaître son « 1,035 ») : un choix dont le
   doute a disparu est **ignoré, jamais refusé** — rien d'écrit, rendu
   dans `ignoredChoices` et dit à l'écran (« N choix sans objet : le
   doute a disparu avec vos autres choix »).
   L'audit prévisualise, le chargement applique les choix aux mêmes
   fichiers (même lecture du journal, avant l'audit) et le rapport lisible
   nomme les doutes tranchés autrement que par l'outil (`changes.settled` :
   l'option appliquée diffère de celle de l'outil — la case cochée seule
   sur le choix de l'outil est tracée et mémorisée, pas listée là ;
   `settledBy` sur un projet écarté par un choix, y compris une cellule
   ME illisible écartée, dont la raison nomme la cellule). La commande applique
   les choix mémorisés (avec `--charger` / `--comparer`), sinon ceux de
   l'outil, imprime chaque doute et comment il a été tranché, et n'écrit
   aucun choix.

## Vue

⚙ › Importer, après le rapport lisible et avant les conflits de domaine et
« Charger » : la section **« Doutes à trancher »**. En tête : « N doute(s) —
l’outil a pré-choisi ; changez ce qui ne va pas ». Les doutes sont groupés
par sorte (repliés au-delà de dix) ; chaque doute est un cadre : code ·
titre — question, pourquoi, les choix en boutons radio avec leur
conséquence, le choix de l’outil coché et marqué « choix de l’outil », la
case « Ne plus me demander pour ce projet (question) ». Les choix mémorisés sont repliés sous « Déjà
tranchés (M) » — le choix, le jour, l’auteur (« vous » jusqu’à RP3), le
pourquoi en clair — avec « Redemander », qui
remet la question parmi les doutes, sur le choix de l’outil.

- **Ce qui part au chargement** : seulement les doutes touchés — un autre
  choix que celui de l’outil, la case cochée, ou « Redemander ». Un doute
  laissé tel quel n’envoie rien : l’outil applique son choix, rien n’est
  écrit, la question reviendra (« tant que tu n’as pas cliqué »). Ainsi le
  rapport ne compte pas comme « tranchés » les choix de l’outil.
- **Ce qu’on lit est ce qu’on charge** : un choix qui change ce que le
  rapport affiché a appliqué (le cocher seul ne change rien) met
  « Charger » en attente d’un nouvel audit, « Revoir le rapport avec ces
  choix » ; celui-ci garde les réponses et les décisions de domaine, et
  redemande « J’ai lu le rapport ». Pendant cette demande, les doutes,
  les conflits et « Charger » restent affichés (inactifs) : les groupes
  dépliés le restent, la page ne saute pas. Un nouvel « Auditer » repart des choix
  de l’outil.
- Le rapport lisible nomme les « Doutes tranchés autrement que par
  l’outil » (mémorisé ou choisi à ce chargement), le périmètre dit le
  projet écarté par un choix, le résumé du chargement compte les choix
  enregistrés dans le journal d’événements (la vue Analytics › Journal,
  ADR 052, ne les montre pas — § 3). `remembered` porte l’auteur du choix (`actor`
  de l’événement `settled`).
- Fichiers : `front/importDoubts.ts` (état, envoi, textes — testé),
  `front/useImport.ts`, `front/apiImport.ts` (les deux appels d’import,
  sortis de `api.ts`), `front/components/DoubtsSection.tsx`,
  `doubtParts.tsx` ; `ImportOutcome`, `ImportView`, `ImportLists`,
  `ImportChanges`, `FilesStrip`, `importReport.ts`, `admin.css`.

## Données personnelles

Aucune valeur tirée d'un nom de personne n'entre dans le journal
(CLAUDE.md §4 et §6) — ni le nom, ni son empreinte : une empreinte sans
clé (FNV-1a) se retrouve en hachant une liste du personnel. Aucun secret
n'est ajouté pour autant ; la règle est de ne rien dériver d'un nom.

- **Chef de projet en double dans ProjetsCdP** : les choix sont repérés
  par leur **numéro de ligne** (`ligne:N`), le journal ne garde que
  « ligne N ». Comme une ligne change d'un export à l'autre, ce doute
  n'est **jamais mémorisé** : pas de case « Ne plus me demander » (l'écran
  dit « Question reposée à chaque import »), la question revient à chaque
  import, chaque réponse est tracée par son seul numéro de ligne
  (`sticky` toujours faux, même si une requête le demande).
- **Lignes en double de l'onglet Projets (et de SP)** : l'identifiant d'un
  choix et l'empreinte du doute ne lisent que les colonnes montrées qui ne
  sont pas des noms — jamais « Responsable 1 » à « 3 », ni une colonne
  inconnue qui pourrait en contenir. Si deux lignes ne diffèrent que par
  ces colonnes-là, les choix passent au numéro de ligne et le doute est
  posé à chaque import, comme ci-dessus. Les mots écrits au journal
  (`label`) omettent toujours les Responsables.
- Revue des autres doutes : états, types, portefeuilles, noms de projet,
  cellules ME, montants, Id et titres de cartes — aucun nom de personne.
  Le nom reste montré au PMO à l'écran, jamais écrit.
- Le type `ImportDoubt` porte `askedEachTime: true` pour ces doutes ; le
  test `middle/import.privacy.test.ts` vérifie qu'aucun nom, ni son
  empreinte, n'est dans le journal après un chargement.

## Conséquences

- Deux règles par défaut changent sur des données réelles, pour ne plus
  dépendre de l'ordre des lignes (ADR 056) : un projet sur plusieurs
  lignes SP garde la ligne « la plus fréquente, puis la plus complète,
  puis la première par ordre alphabétique » (avant : la première lue) — et
  une ligne sans Id lue avant la ligne à l'Id ne l'écarte plus ; deux
  projets de l'export sur une même carte chargent le premier **par code
  puis par titre** (avant : le premier dans l'ordre du fichier).
- Un choix mémorisé survit aux imports tant que les fichiers disent la
  même chose ; dès qu'ils changent, la question revient d'elle-même.
- Jusqu'à RP3, l'auteur des choix est « anonymous », comme toute écriture.
- Un chef de projet choisi sur un Id en double de ProjetsCdP vaut aussi
  pour la carte qui joint cette ligne par son nom (carte sans code, ou
  ligne homonyme prise).
- Hors périmètre : `amountCell` (j.h) ne signale pas « 1,035 » ; les
  projets écartés sans ME et les codes hors PE restent des signalements
  (à confirmer avec l'auteur avant d'en faire des questions).
- Fichiers : `core/import-doubts.ts`, `core/types.ts`, `core/fold-order.ts` ;
  `adapters/csv-import/` (`doubt-book.ts`, `doubt-memory.ts`, `hash.ts`,
  `couts-doubts.ts`, `row-choice.ts`, `projets-duplicates.ts`,
  `jalons-duplicates.ts`, `sp-groups.ts`, `enrich-joins.ts`,
  `load-doubts.ts`, et les lecteurs) ; `middle/import.ts`,
  `middle/import-choices.ts`, `sync/import.ts`,
  `sync/import-doubts-text.ts`, et leurs tests.
