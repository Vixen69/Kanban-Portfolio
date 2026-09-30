# ADR 059 — L'import adopte la carte créée à la main

Date : 2026-09-30 · Statut : proposé (branche import-lisible) · Amende
l'ADR 035 (identité « code@année ») ; suit l'ADR 057 (tout se saisit à la
main) · Amendé par l'ADR 060 (corrections à la main et position d'une
carte adoptée)

## Contexte

Le PMO crée à la main un projet qui manque à l'export (ADR 057) et y tape
son vrai code. Quand le projet arrive ensuite dans l'export, l'import ne
reconnaissait les cartes que par « code@année » : il créait une seconde
carte, et le tableau montrait le projet deux fois — la carte à la main et
la carte importée.

## Décision

Au chargement d'un exercice, une carte **créée à la main** (source
« manuelle »), du **même exercice**, ni archivée ni supprimée, dont le
code projet est celui d'un projet de l'export (casse et espaces ignorés),
est **adoptée** :

- elle **garde son identifiant** (S…) : son journal, ses commentaires,
  ses décisions restent les siens ; l'identifiant est noté comme alias
  (comme les cartes d'avant l'ADR 035), la capacité du plan de charge la
  suit ;
- sa carte de base devient celle de l'import : source « import »,
  référence Sciforma = le code, faits de l'export (ADR 054 : un fait que
  les fichiers laissent vide garde la valeur saisie) ; son **instant de
  création est gardé** ; seuls les faits de l'export sont remplacés : ce
  que l'export ne porte jamais — criticité, notes, ressources, libellé du
  plan de charge, étiquettes, risques, contraintes, alertes, contention,
  champs de carte — saisi à la création (ADR 057) **reste celui de la
  carte** ;
- ses modifications à la main (événements `edited`) continuent de
  s'appliquer par-dessus ; son domaine suit l'ADR 036 (un écart est un
  conflit que le PMO tranche) ; sa position suit l'ADR 026 (déplacée à la
  main vers une autre colonne : elle y reste) — **amendé par l'ADR 060** :
  une valeur de l'export qui diffère de la saisie reprend aussi la
  correction à la main, et un jalon qui la place plus loin que sa colonne
  la déplace ;
- le rapport d'import la nomme parmi les **adoptées** (titre saisi, titre
  de l'export) ; les chargements suivants la retrouvent par son code.

**Deux cartes à la main portant le même code** : aucune n'est adoptée, la
question est dite, la carte de l'export est créée à part. Une carte à la
main supprimée, archivée ou d'un autre exercice n'est jamais adoptée ; si
l'instance « code@année » existe déjà, elle reste la carte du projet.

## Conséquences

- Le cas « projet manquant ajouté à la main » ne finit plus en doublon.
- La référence Sciforma reste une vérité de l'export : elle n'est jamais
  saisie à la main, l'adoption la pose.
- L'adoption n'écrit pas d'événement au journal (comme tout rafraîchissement
  de la carte de base) : elle se lit dans le rapport du chargement, et la
  comparaison avec l'instantané « avant chargement » (ADR 053) montre ce
  qui a changé sur la carte. L'Historique de la fiche ne la raconte pas.
