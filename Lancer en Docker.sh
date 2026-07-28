#!/usr/bin/env bash
# Double-click launcher (Docker, MODE DEMO) : base PostgreSQL + middle + front
# + Adminer (éditeur de base web), données de démonstration, puis navigateur.
# MODE DEMO : le garde append-only de la base est DÉSACTIVÉ
# (KANBAN_PG_APPEND_ONLY=0) pour permettre l'édition directe de la base.
# En production, laisser ce drapeau à 1 (garde active). Nécessite Docker Engine.
# Arrêter avec "Arreter Docker.sh". Linux counterpart of "Lancer en Docker.cmd".
set -u
cd "$(dirname "$0")"

fail() { echo "$1"; [ -t 0 ] && read -rp "Appuyer sur Entrée pour fermer... "; exit 1; }

# VM sans droits admin : Node peut vivre dans le HOME (node-v22.x/bin) — même
# complément de PATH que « Lancer le tableau.sh » (le double-clic ne lit pas
# ~/.bashrc). Node ne sert ici qu'au semis de démonstration.
if ! command -v node >/dev/null 2>&1; then
  NODE_HOME="$(ls -d "$HOME"/node-v*/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "${NODE_HOME:-}" ] && export PATH="$NODE_HOME:$PATH"
fi

# --- MODE DEMO : autorise l'édition directe de la base ---
export KANBAN_PG_APPEND_ONLY=0

command -v docker >/dev/null 2>&1 \
  || fail "Docker est introuvable. Installer Docker Engine + le plugin compose, puis relancer."
docker info >/dev/null 2>&1 \
  || fail "Le démon Docker ne répond pas. Le démarrer (sudo systemctl start docker) ou vérifier que l'utilisateur est dans le groupe docker, puis relancer."

echo
echo "Construction et démarrage (base + middle + front + Adminer, quelques minutes la 1re fois)..."
docker compose -f docker/compose.yaml --profile app --profile tools up -d --build \
  || fail "Le démarrage a échoué. Voir les messages ci-dessus."

echo "Attente de la base et du middle..."
sleep 8

if command -v node >/dev/null 2>&1; then
  # Le semis tourne sur l'HÔTE : il lui faut les dépendances locales (pg).
  # Un dossier utilisé uniquement en mode Docker ne les a jamais installées
  # (vu sur la VM client : ERR_MODULE_NOT_FOUND 'pg' après un dézippage neuf).
  if [ ! -d node_modules ]; then
    echo "Dépendances du semis absentes : npm ci (une fois)..."
    npm ci || echo "npm ci a échoué — pile lancée, base laissée vide. Corriger puis relancer pour semer."
  fi
  if [ -d node_modules ]; then
    echo "Données de démonstration (idempotent)..."
    KANBAN_ALLOW_SEED=1 KANBAN_STORAGE_DRIVER=postgres \
    DATABASE_URL=postgres://kanban:thuglife@localhost:5432/kanban \
    node scripts/seed.ts
  fi
else
  echo "Node.js introuvable : pile lancée, base laissée vide (installer Node 22 puis relancer pour semer la démo)."
fi

echo "Ouverture du navigateur..."
sleep 2
command -v xdg-open >/dev/null 2>&1 && xdg-open http://localhost:8080 >/dev/null 2>&1 &

echo
echo "  Tableau     : http://localhost:8080"
echo "  Éditeur BD  : http://localhost:8081   (Système PostgreSQL, Serveur db, kanban / thuglife, base kanban)"
echo "                édition par champs des cartes et évènements (repli JSON brut dans la fiche)"
echo
echo "Conteneurs lancés. Pour arrêter : exécuter \"Arreter Docker.sh\"."
[ -t 0 ] && read -rp "Appuyer sur Entrée pour fermer... "
