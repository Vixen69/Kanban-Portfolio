# Runbook — Portefeuille DSI · Kanban NMO

Remonter la pile sur la VM, puis importer les exports Sciforma — de l'audit
jusqu'aux cartes affichées sur le tableau.

| | |
|---|---|
| VM | `DVPZ-KANBAN-VD1` |
| Dossier | `/app/Kanban-Portfolio` (clone git) |
| Tableau | `http://localhost:8080` |

---

## A. Remonter la pile

**1. Se placer dans le dépôt**

```bash
cd /app/Kanban-Portfolio
```

**2. Démarrer les conteneurs** (base, middle, front)

```bash
docker compose -f docker/compose.yaml --profile app up -d
```

**3. Vérifier**

```bash
docker compose -f docker/compose.yaml --profile app ps
```

> **Attendu** : `db` healthy · `middle` Up · `front` Up sur `127.0.0.1:8080`

Puis ouvrir `http://localhost:8080` — **Ctrl+F5** au premier affichage.

**En option — Adminer**, pour inspecter la base :

```bash
docker compose -f docker/compose.yaml --profile app --profile tools up -d
```

> **Accès** : `localhost:8081` · PostgreSQL · serveur `db` · `kanban` / `thuglife` · base `kanban`

---

## B. Importer les exports Sciforma

Déposer les CSV dans `imports/`. La reconnaissance se fait **par les
en-têtes**, jamais par le nom du fichier — seule contrainte : deux fichiers
ne peuvent pas porter le même nom.

| Fichier | Ce qu'il apporte |
|---|---|
| `Projets.csv` **(requis)** | Le périmètre : chaque ligne est une carte (Id, nom, type, domaine et sous-domaine, dates). L'onglet consolidé (colonnes « Domaine (Orga) ») ou l'export brut (chemin d'organisation, traduit par PARAM). **Sans colonnes Responsable** : si deux fichiers ont la forme Projets, c'est celui-là qui fait foi. |
| `ProjetsCdP.csv` | Les chefs de projet : l'export complet des projets avec Responsable 1→3 (responsables de domaine de PARAM exclus). Jamais le périmètre, quel que soit son nom. |
| `PARAM.csv` | La table de correspondance du PMO : responsables de domaine (exclus du chef de projet) et chemins d'organisation → domaine / sous-domaine. |
| `ProjetsJalons.csv` | La position initiale : RDO / RDLI / RDR « franchi » → Études / Actifs / Exploitation, sinon Demandes. |
| `SP_2026.csv` | Les coûts 2026 : meilleur estimé, réel, engagé (l'export `SP_total` est accepté aussi, jointure par nom). |
| `Ressources_PdC.csv` | Plan de charge 2026 par profil, plus la consolidation nominative (taux ETP). |
| `Ress.Profils.csv` | Les personnes de la DSI : domaine Orga, métier, Int/Ext, disponibilité de l'exercice — la capacité de la vue ☷. |

Un `RDOM.csv` de juillet est inventorié « contrat retiré » et n'est pas lu.

**0. Convertir le classeur de consolidation** — un CSV par onglet, UTF-8, séparateur `;`

```bash
soffice --headless -env:UserInstallation=file:///tmp/lo_conv --convert-to 'csv:Text - txt - csv (StarCalc):59,34,76,1,,0,false,true,true,false,false,-1' --outdir imports/ Classeur.xlsx
```

> Le `-1` final exporte **tous les onglets** (LibreOffice ≥ 7.2) ; les fichiers s'appellent `Classeur-Onglet.csv`, la reconnaissance se fait par les en-têtes. Commande à valider au premier passage sur la VM.

**1. Auditer** — n'écrit rien dans le tableau

```bash
node sync/import.ts imports
```

> **Produit** : `imports/rapport-import.md` + le résumé Pris / Écartés / Douteux / Signalements

**2. Lire le rapport** — section « État de l'assemblage »

Périmètre, répartition des cartes, position, **domaine n/N**, **chef de
projet n/N**, couverture du plan de charge. On ne charge que lorsque ces
chiffres tiennent.

**3. Préparer les dépendances** — une seule fois par machine

```bash
docker cp portfolio-kanban-middle-1:/app/node_modules ./node_modules
```

Sans réseau. Alternative classique : `npm ci`. Nécessaire uniquement pour le
chargement (le pilote PostgreSQL) ; l'audit tourne sans aucune dépendance.

**4. Charger dans le tableau**

```bash
export KANBAN_STORAGE_DRIVER=postgres
export DATABASE_URL=postgres://kanban:thuglife@localhost:5432/kanban
node sync/import.ts imports --charger
```

> **Attendu** : `destination : PostgreSQL (…)` puis
> `chargement : N créée(s) · M mise(s) à jour`

---

## C. Contrôles et entretien

**Compter les cartes en base**

```bash
docker exec portfolio-kanban-db-1 psql -U kanban -d kanban -c "SELECT count(*) FROM cards;"
```

**Vider les données** (cartes, journal, capacité) — garde le schéma, la topologie et la surcharge de configuration ; après un import raté par exemple

```bash
docker exec portfolio-kanban-db-1 psql -U kanban -d kanban -c "TRUNCATE cards, card_events, capacity RESTART IDENTITY;"
```

**Mettre à jour le code** — la VM tourne sur un clone git depuis le 2026-09-10

```bash
cd /app/Kanban-Portfolio && git pull && docker compose -f docker/compose.yaml --profile app up -d --build
```

> Le proxy authentifié est configuré dans `~/.gitconfig` (mot de passe = le
> **token**, pas le mot de passe Windows). En repli, si git retombe en panne :
> nouveau ZIP GitHub → `chmod +x *.sh` → même `up -d --build`. Ne jamais
> construire depuis un ZIP partiel : le middle qui échoue sur
> `adapters/csv-import/index.ts` (502 sur /api) = un dossier incomplet.

**Arrêter** — les données restent dans le volume

```bash
docker compose -f docker/compose.yaml --profile app down
```

**Session bloquée après une absence**

```bash
pkill -u $USER -f xrdp
```

Puis se reconnecter. Si ça persiste : disque plein (`df -h`) ou mot de passe
expiré.

---

## Les pièges

*(tous rencontrés au moins une fois)*

**1. Jamais `-v` ni `--volumes`** — sur `down` comme sur
`docker system prune` : c'est le volume qui contient les cartes. Sans ce
drapeau, les données survivent à tout.

**2. `export` est obligatoire** — une affectation seule sur sa ligne n'est
pas transmise à `node` : le pilote reste `jsonl` et les cartes partent dans
un fichier au lieu de la base. Contrôler la ligne `destination :` affichée
juste avant l'écriture.

**3. Deux fichiers, deux noms** — deux fichiers ne peuvent pas porter le
même nom dans `imports/`. Et si deux fichiers correspondent au même contrat
(l'onglet consolidé ET l'export brut, par exemple), seul le plus propre est
lu, l'autre est signalé « non retenu ».

**4. L'audit est le défaut** — rien n'est écrit dans le tableau tant que
`--charger` n'est pas passé. Le rapport, lui, est produit à chaque exécution
et écrasé.

**5. Le ré-import respecte vos arbitrages** — il met à jour les cartes
existantes et ajoute les nouvelles. L'export gagne sur les **faits**
(budgets, charge, domaine, chef, dates) ; le tableau garde la **position**
d'une carte déplacée à la main — la divergence est signalée, jamais écrasée.

---

## Règles de fond

- **Identité des cartes** : l'Id Sciforma, sinon le code PE, sinon le nom.
- **Périmètre** : la liste `Projets.csv` fait foi — aucune exclusion par
  portefeuille ; un type hors des quatre retenus est signalé, jamais exclu.
- **Position** : le dernier jalon franchi (RDR → Exploitation, RDLI →
  Actifs, RDO → Études), sinon Demandes.
- **Âge** : depuis la date de début du projet.
- **Canal** : toutes les cartes importées entrent en « Projets ».

Le détail des décisions d'import est dans `docs/IMPORT-MAPPING.md` ; la
livraison conteneurisée dans `LIVRAISON.md`.
