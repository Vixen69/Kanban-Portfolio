# Posture de sécurité

Document de référence pour la revue par un officier de sécurité.
État : Sprint 1 (application statique, aucun backend).

## Principes permanents

- **Zéro egress.** L'application web n'établit jamais de connexion sortante.
  Aucune télémétrie, aucun CDN, aucune police distante, aucun actif distant.
  Les polices sont les polices système ; tout le CSS est écrit à la main.
- **Aucun service externe.** Pas de cloud, pas de SaaS, pas de runtime tiers.
- **Surface minimale.** Budget de dépendances : 1 dépendance runtime serveur
  maximum, 12 dépendances directes maximum (voir `DEPENDENCIES.md`).
  Aucune bibliothèque de composants UI, aucun framework serveur, aucun ORM.

## Build vérifiable

- `package-lock.json` est versionné ; l'installation se fait exclusivement
  par `npm ci`.
- `scripts/vendor.ts` vendorise les tarballs sous `vendor/` pour une
  installation entièrement hors-ligne sur la machine côté client.
- `verify.sh` rejoue install, conventions, typecheck, tests, build et SBOM ;
  il doit passer à l'identique des deux côtés.
- Un SBOM CycloneDX (`sbom.json`) est généré à chaque build par un script
  maison (aucune dépendance ajoutée pour l'outillage SBOM). La sortie est
  reproductible (pas d'horodatage).
- Après chaque traversée vers l'environnement client : comparaison sha256
  fichier par fichier.

## Données

- La machine de développement ne voit **que** des données synthétiques
  (adaptateur `fixtures`). Aucune donnée client réelle n'entre ici.
- Aucun secret dans le code, le dépôt ou les journaux. Les identifiants de
  synchronisation (Sprint 5) vivront dans un fichier hors dépôt, restreint
  par permissions (chmod 600), référencé par chemin.
- Le journal d'événements (`card_events`) est en append-only : c'est à la
  fois la piste d'audit et la source des métriques de flux.
- Les journaux ne contiendront ni titres de cartes ni valeurs financières,
  uniquement des identifiants.

## À venir (sprints suivants)

- Sprint 3 : serveur `node:http`, en-têtes CSP (`default-src 'self'`),
  SQLite local. Le serveur ne fait aucune connexion sortante.
- Sprint 4 : comptes locaux (hachage `scrypt` de `node:crypto`), rôles
  câblés en dur (viewer/editor/admin), sessions cookies httpOnly +
  SameSite=Strict + Secure, pas de JWT, pas d'auto-inscription.
- Sprint 5 : la synchronisation PPM est un processus séparé (`sync/`),
  en lecture seule, jamais le serveur web.

## Signalement

Projet interne — signaler tout problème au propriétaire du dépôt.
