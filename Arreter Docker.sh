#!/usr/bin/env bash
# Double-click : arrête les conteneurs Docker du tableau (garde les images
# et les volumes db-data/config-data). Relancer avec "Lancer en Docker.sh".
# Linux counterpart of "Arreter Docker.cmd".
set -u
cd "$(dirname "$0")"

echo "Arrêt des conteneurs..."
docker compose -f docker/compose.yaml --profile app --profile tools down

echo
echo "Terminé. Les images et les volumes (db-data, config-data) sont conservés."
[ -t 0 ] && read -rp "Appuyer sur Entrée pour fermer... "
