# Fiche solution — Portefeuille DSI · Kanban NMO
**Note à l'attention des services Cybersécurité et Informatique** — diffusion interne
Version 1.1 · 2026-07-16 · Auteur : Pierre-Yves Revellin

---

## 1. Ce que c'est, concrètement

Un **tableau kanban de portefeuille de projets** pour l'équipe PMO : une page web
unique qui affiche tous les sujets du portefeuille (150 aujourd'hui en démo) en
colonnes d'avancement, avec l'âge de chaque sujet, les blocages, la charge et le
budget. On y déplace les cartes, on les édite, on les commente ; une vue
métriques calcule les temps de traversée. C'est tout — pas de messagerie, pas de
workflow, pas de connexion à d'autres outils à l'exécution.

Physiquement, la solution est **trois conteneurs Docker sur une machine** :

| Conteneur | Contenu | Rôle |
|---|---|---|
| **front** | nginx + un bundle JavaScript statique (~9 000 lignes de TypeScript maison compilées avec React) | Sert la page web et relaie `/api` vers le middle (même origine) |
| **middle** | Node.js + une API Express de **6 routes** | Valide chaque action et l'écrit dans la base ; ~3 000 lignes maison |
| **db** | PostgreSQL 16 | **2 tables** : `cards` (les sujets) et `card_events` (le journal) |

Le principe central : **la base ne stocke pas « l'état » du tableau, elle stocke
l'historique**. Chaque action de l'utilisateur (créer, déplacer, bloquer, éditer,
commenter, archiver, supprimer) devient **une ligne horodatée dans `card_events`,
qui n'est jamais modifiée ni supprimée** (un trigger SQL interdit UPDATE/DELETE).
L'écran est recalculé à la lecture en rejouant ce journal. Le même journal sert de
piste d'audit et de source des métriques.

À noter :

- **Aucune connexion sortante.** L'application ne contacte jamais l'extérieur :
  pas de télémétrie, pas de CDN, pas de police distante. Le navigateur ne parle
  qu'au front ; le middle ne parle qu'à la base.
- **Les ports sont liés à 127.0.0.1** : rien n'est joignable depuis le réseau
  par défaut. L'exposition aux autres postes est un **opt-in explicite** qui
  n'ouvre que le point d'entrée front (port 8080) — le middle et la base ne
  sont jamais exposés.
- Le middle tourne en **utilisateur non-root** ; les en-têtes de sécurité (CSP,
  nosniff, etc.) sont posés sur la page et sur l'API ; corps de requête plafonné.
- **Pas encore de comptes utilisateurs** (prévu, phase RP3) : aujourd'hui l'outil
  est mono-utilisateur, protégé par l'accès à la machine — c'est un choix assumé
  pour la phase actuelle.
- Vérification : **318 tests automatisés**, dont des tests qui vérifient les
  frontières d'architecture et le caractère append-only de la base.

---

## 2. SBOM réel, comparé au référentiel A&D

Ce qui tourne réellement en production est **très en dessous** de ce que le
référentiel A&D autorise — à **une exception près, ajoutée avec accord**.

**Inventaire réel à l'exécution** (mesuré sur l'arbre installé, pas déclaratif) :

| Où | Paquets npm réellement embarqués | Détail |
|---|---|---|
| Image **front** | **Aucun.** | React 18.3.1 + react-dom sont compilés dans le bundle statique au build ; aucun `node_modules` n'est livré. |
| Image **middle** | **~80 paquets** : `express` 5.2.1 (65 paquets avec ses dépendances) + `pg` 8.22.0 (13 paquets) | Installés en mode production (`--omit=dev`). Ce sont les deux seules dépendances directes du middle. |
| Cœur métier (`core/`) | **Zéro dépendance.** | TypeScript pur ; les tests utilisent `node:test`, natif de Node. |
| Images de base | `node:22.18-alpine`, `nginx:1.27-alpine`, `postgres:16-alpine` | Épinglées par empreinte (digest) — le build est reproductible. |

L'outillage de build (TypeScript 5.9, Vite 7, types) n'est **pas livré** — il
n'existe que sur la machine de développement. Un **SBOM CycloneDX** (217
composants, arbre complet dev inclus) est généré à chaque build depuis le
lockfile et embarqué dans l'image middle (`/app/sbom.json`).

**Comparaison au référentiel A&D :**

- **Conforme** : `express`, `react`/`react-dom`, TypeScript, Vite figurent dans
  les versions autorisées du référentiel. Node 22 est la version d'exécution
  prévue par la plateforme.
- **Le référentiel autorise beaucoup plus que ce qu'on utilise** : Tailwind,
  Radix, axios, react-router, cookie-parser, cors, jsonwebtoken, dotenv… sont
  autorisés mais **volontairement absents** de l'installation actuelle. Le CSS
  est écrit à la main, l'application est mono-page, les appels réseau passent
  par le `fetch` natif.
- **L'écart unique : PostgreSQL.** Le référentiel A&D d'origine **ne comportait
  pas de base de données ni de client de base**. L'ajout couvre deux choses :
  le **serveur PostgreSQL 16** (conteneur d'infrastructure) et le client npm
  **`pg`** (13 paquets, JavaScript pur, sans compilation native). Cet ajout a
  été **soumis au référent technique et autorisé le 2026-07-07**, est tracé par
  une décision d'architecture (ADR 016), et le client `pg` est confiné à un seul
  fichier adaptateur — un test automatique échoue si un autre module l'importe.

En résumé : **surface réelle = express + pg + le bundle React statique**, tout le
reste du référentiel étant du disponible non utilisé, et PostgreSQL/`pg` étant le
seul élément hors référentiel d'origine, ajouté avec autorisation formelle.

---

## 3. Entrées et sorties

**Aujourd'hui, la seule entrée de données est le clavier de l'utilisateur, et la
seule sortie est l'écran.** Il n'existe aucun flux réseau entrant ou sortant
au-delà de la machine.

### Présent

| Flux | Sens | Description |
|---|---|---|
| **Saisie dans l'interface** | Entrée | Création de sujets (« + Sujet »), déplacements, blocages avec motif, éditions, commentaires, archivages, suppressions. Chaque action = un évènement horodaté en base. |
| **Configuration du tableau** | Entrée | Panneau d'administration : noms des colonnes/canaux, domaines, seuils. Vocabulaire uniquement — le comportement n'est pas configurable. |
| **Données de démonstration** | Entrée (dev) | 150 sujets synthétiques, générés — utilisés pour le développement et la démo. Jamais de donnée réelle sur la machine de développement. |
| **Page web + API** | Sortie | Le tableau, la fiche détaillée, la vue métriques. API en même origine, lecture/écriture locale seulement. |
| **Journaux techniques** | Sortie | Une ligne par requête : méthode, chemin, statut, identifiants. **Jamais de titre de sujet ni de montant** dans les journaux. |
| **Base PostgreSQL** | Interne | Les 2 tables décrites en §1. Sauvegarde = sauvegarde du volume Docker de la base. |

### Futur (développements prévus, non livrés)

| Flux | Sens | Description prévue |
|---|---|---|
| **Import d'exports Sciforma (`.xlsx`)** | Entrée | Outil **en ligne de commande, autonome** : on lui donne le fichier Excel exporté de Sciforma, il lit les colonnes utiles et remplit la base (mêmes évènements que la saisie manuelle, marqués « import »). **Lecture seule du fichier, aucune connexion réseau, ne touche jamais Sciforma lui-même.** |
| **Connexion Planisware** | Entrée | Plus tard : un **processus de synchronisation séparé** (jamais le serveur web) interrogera Planisware en **lecture seule**, avec un compte de service à moindre privilège, identifiants dans un fichier protégé hors dépôt. Il écrit en base puis s'arrête. |
| **Comptes et rôles (RP3)** | Entrée | Comptes **locaux** (pas de LDAP, pas d'auto-inscription), mots de passe hachés `scrypt` (natif Node), session en cookie httpOnly. L'acteur de chaque évènement du journal deviendra l'utilisateur authentifié. |

Dans tous les cas, le principe reste : **le serveur web n'ouvre jamais de
connexion sortante** ; seul un processus d'import/synchronisation séparé, en
lecture seule, touche les outils externes.

---

*Références dans le dépôt : `SECURITY.md` (posture détaillée), `DEPENDENCIES.md`
(gouvernance SBOM), `LIVRAISON.md` (construction / déploiement), `docs/adr/`
(décisions d'architecture).*
