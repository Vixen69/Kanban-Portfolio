#!/usr/bin/env bash
# Double-click launcher : Adminer seul (éditeur de base web) + PostgreSQL.
# Ne démarre PAS le tableau (middle/front) — pour la pile complète de démo,
# utiliser "Lancer en Docker.sh". Nécessite Docker Engine.
# L'édition des cartes/évènements se fait par champs (plugin card-boxes) ;
# repli JSON brut disponible dans chaque fiche.
# Linux counterpart of "Lancer Adminer.cmd".
set -u
cd "$(dirname "$0")"

fail() { echo "$1"; [ -t 0 ] && read -rp "Appuyer sur Entrée pour fermer... "; exit 1; }

command -v docker >/dev/null 2>&1 \
  || fail "Docker est introuvable. Installer Docker Engine + le plugin compose, puis relancer."
docker info >/dev/null 2>&1 \
  || fail "Le démon Docker ne répond pas. Le démarrer (sudo systemctl start docker) ou vérifier que l'utilisateur est dans le groupe docker, puis relancer."

echo
echo "Démarrage de la base et d'Adminer..."
docker compose -f docker/compose.yaml --profile app --profile tools up -d db adminer \
  || fail "Le démarrage a échoué. Voir les messages ci-dessus."

echo "Ouverture du navigateur..."
sleep 2
command -v xdg-open >/dev/null 2>&1 && xdg-open http://localhost:8081 >/dev/null 2>&1 &

echo
echo "  Éditeur BD  : http://localhost:8081"
echo "  Connexion   : Système PostgreSQL, Serveur db, kanban / thuglife, base kanban"
echo "  Édition par champs des tables cards et card_events (repli JSON brut dans la fiche)."
echo
echo "Base vide ? Lancer d'abord \"Lancer en Docker.sh\" (données de démonstration)."
echo "Pour arrêter : exécuter \"Arreter Docker.sh\"."
[ -t 0 ] && read -rp "Appuyer sur Entrée pour fermer... "
