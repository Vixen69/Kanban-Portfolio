# ADR 027 — Import depuis l'outil (dépôt des CSV, rapport affiché, bouton Charger, secret partagé)

## Contexte

- Aujourd'hui l'import réel demande, sur la VM : LibreOffice pour convertir
  le classeur en CSV, une ligne de commande (`node sync/import.ts`) et des
  variables d'environnement. Pour transmettre l'outil au PMO (point 4 du
  backlog du 2026-09-07), l'import doit se faire depuis l'interface :
  déposer les fichiers, lire le rapport d'audit, charger.
- Pas d'authentification avant RP3 ; l'accès réseau à la VM reste la
  barrière principale (posture §6). L'auteur a demandé « un secret admin »
  en attendant.
- Contrainte plateforme : rester dans le SBOM (Express, pas de `multer`).
- Mode autonome accordé le 2026-09-08 (« go S3 S4 ») : choix de Claude, à
  contester à la revue.

## Décision

1. **Deux routes**, `POST /api/import/audit` et `POST /api/import/load`,
   qui reçoivent les fichiers **en JSON, base64** (`{ files: [{ name,
   base64 }] }`) — pas de multipart, donc aucune dépendance nouvelle. Plafonds
   : 12 fichiers, 20 Mo par fichier, corps de 40 Mo sur ces deux routes
   seulement (le plafond global de 64 Ko reste sur le reste de l'API).
2. **Le même moteur que la ligne de commande** : `runImportAudit`,
   `renderReport`, `planLoad` de `adapters/csv-import`. Le rapport lu dans
   l'outil est celui que le CLI écrit ; le chargement écrit cartes +
   évènements en un lot, puis le snapshot de capacité. Aucune donnée client
   ne transite ailleurs que dans la requête et le magasin.
3. **Secret partagé** : en-tête `X-Import-Secret`, comparé en temps constant
   (hachage SHA-256 des deux côtés puis `timingSafeEqual`) à
   `KANBAN_IMPORT_SECRET` lu dans l'environnement du middle. Variable absente
   = routes désactivées (403 explicite). Le secret n'est jamais journalisé,
   jamais persisté par le front (mémoire de la page seulement). En
   développement, `npm run serve:dev` pose un secret jetable (« dev-import »).
4. **Écran d'import** (bouton ⬆ de l'en-tête) : secret, dépôt des CSV,
   « Auditer » → rapport affiché (Markdown brut, lisible) et compte rendu ;
   « Charger » n'est actif qu'après un audit dont le périmètre s'est
   assemblé, et exige de cocher « j'ai lu le rapport ». Après chargement, le
   tableau se recharge ; le rapport reste affiché.
5. Les journaux du middle ne portent que des comptes (créées, mises à jour,
   déplacées, absentes, de retour) — jamais de titre ni de montant.

## Conséquences

- Le PMO importe seul, sans terminal ; la ligne de commande reste
  disponible (même moteur, même rapport) pour l'exploitation.
- Le secret partagé est une mesure d'attente : RP3 (comptes, rôles) le
  remplacera par le rôle admin/PMO sans changer les routes.
- Un import ne supprime jamais rien (ADR 026) : l'écran le rappelle et
  affiche les absentes.
- Le corps JSON base64 pèse un tiers de plus que les fichiers ; acceptable
  pour des exports de quelques Mo sur un réseau local.
- À revoir : rendu du rapport (Markdown brut aujourd'hui), historique des
  imports (date, acteur, comptes) comme table de faits à côté du journal.
