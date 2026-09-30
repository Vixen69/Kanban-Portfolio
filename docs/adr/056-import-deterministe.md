# ADR 056 — Import déterministe : un fichier par sorte, un vocabulaire que ⚙ ne déplace pas, un fichier Coût reconnu ou refusé

Date : 2026-09-30 · Statut : accepté (décisions de l'auteur : « un seul mode d'import » ; « tous les trucs que tu dis là »)

## Contexte

L'audit d'import du 30/09 (30 constats vérifiés, fichiers synthétiques) a
montré que les mêmes exports pouvaient donner un autre tableau :

- **Élection par le nom** : deux fichiers pour un même contrat, l'importeur
  en lisait un selon l'ordre alphabétique des noms. « Cout (1).csv » battait
  « Cout.csv », un nom daté élisait l'export le plus ANCIEN ; l'autre fichier
  n'avait droit qu'à une ligne douteuse.
- **Libellés d'affichage** : le type et le domaine d'un projet se lisaient
  aussi par le nom et le code court, que ⚙ › Catégories renomme. Renommer
  « Projet de mise en œuvre » sortait du périmètre tous ces projets (cartes
  « absentes »), et « Réinitialiser le modèle » les faisait revenir.
- **Bascule silencieuse du périmètre** : un en-tête « Année » abîmé (ou un
  seul octet parasite qui faisait lire tout le fichier en Windows-1252)
  écartait l'export Coût, et l'onglet Projets devenait le périmètre sans
  règle d'exercice, d'état, de type ni de ME. Le chargement était accepté.
- **Ordre des lignes** : les faits d'un projet COUT PREV (état, type,
  portefeuille, nom) venaient de sa PREMIÈRE ligne, quelle que soit son
  année ; si les lignes d'un Id divergeaient, l'ordre du fichier décidait.
- **Formats de nombres** : « 1,234.50 » (conversion en anglais) était
  illisible, donc compté vide ; « 1,035 » lu 1,035 sans rien dire ; « 2 026 »
  ou « 01/01/2026 » en Année rejetait le projet « hors année ».

## Décision

1. **Un fichier par sorte.** Deux fichiers (ou plus) reconnus pour un même
   contrat ne sont PAS départagés : l'audit les nomme, aucun n'est lu, et le
   chargement est refusé — « Deux fichiers Coût : « A » et « B » — n'en
   déposer qu'un. ». Même règle pour un même nom de fichier reçu deux fois.
   Le couple Projets légitime reste (l'onglet sans « Responsable 1 » = le
   périmètre ; l'export complet = les chefs de projet), mais deux fichiers
   de la même forme refusent aussi.
2. **Le vocabulaire de l'import est celui du modèle versionné.** Types et
   domaines se reconnaissent par l'id, le nom et le code court de
   `config/board.json`, leurs alias, sous-domaines et marqueurs. Un nom
   renommé dans ⚙ n'est consulté qu'en dernier recours, quand rien d'autre
   n'a répondu, et le rapport le dit. Un renommage ne change donc ni le
   périmètre ni les domaines. Même règle dans l'outil et dans le CLI.
3. **Un fichier qui ressemble à l'export Coût sans être reconnu refuse le
   chargement** (en-tête proche — au moins 3 des 5 colonnes obligatoires —
   ou fichier illisible en UTF-16 sans autre export Coût) : le périmètre ne
   bascule jamais sur l'onglet Projets en silence. Sans aucun fichier de
   type Coût, l'onglet Projets reste le périmètre (ADR 030), avec un douteux
   qui le dit.
4. **Encodage.** Un fichier UTF-8 qui contient quelques octets invalides
   (au plus un pour 20 caractères accentués valides) reste lu en UTF-8 : les
   octets fautifs sont remplacés par « � » et signalés en douteux (lignes
   données). Au-delà, c'est un fichier Windows-1252, comme avant.
5. **Faits COUT PREV indépendants de l'ordre.** Ils viennent des lignes de
   l'exercice (des autres années seulement s'il n'y en a aucune) ; en cas de
   désaccord : la valeur la plus fréquente, puis la « Date d'export » la plus
   récente, puis l'ordre alphabétique. Tout désaccord entre les lignes d'un
   Id (même d'une année à l'autre) est un douteux qui nomme l'Id et les
   valeurs en concurrence.
6. **Nombres et années.** Sont lus : « 1,234.50 », « €1,234.50 »,
   « 1.234,50 », « (1 234,50 €) », « 1,2345E+03 » ; en Année : « 2 026 »,
   « 2026,00 », « 2,026 », « 01/01/2026 ». La forme ambiguë (virgule seule
   suivie de trois chiffres : « 1,035 », « 120,500 € ») garde la lecture
   française ET devient un douteux (fichier, lignes, colonne) dans les
   colonnes en k€. Les valeurs d'Année lues sont listées. Une cellule ME
   illisible garde le projet et devient un douteux (jamais un zéro muet) ;
   un tiret comptable (« - € ») vaut zéro. « arbitrage » s'écarte comme mot
   entier du nom (« d'arbitrage », « Arbitrages » oui ; « arbitragiste » non).

## Conséquences

- Mêmes fichiers → même tableau, quels que soient leur nom, leur ordre,
  l'ordre des lignes du Coût ou un renommage dans ⚙.
- Un même Id sur plusieurs lignes de l'onglet Projets ou de ProjetsCdP :
  la ligne gardée ne dépend plus de l'ordre des lignes — la plus
  fréquente, puis la plus complète, puis la première par ordre
  alphabétique ; les autres restent dites (douteux, signalement).
- Le PMO doit parfois retirer un fichier avant de charger : le refus dit
  lequel. L'audit reste possible (rapport lisible), il ne prévisualise rien.
- `AuditResult.blockers` porte les refus ; le middle et le CLI refusent le
  chargement dessus. Le front affiche le refus via la liste des fichiers
  (statut « douteux ») et le message d'erreur du chargement.
- Les dates américaines (« 10/05/2026 ») restent lues à la française : la
  détection par fichier relève du lecteur ProjetsJalons.
