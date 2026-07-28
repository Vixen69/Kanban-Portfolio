#!/usr/bin/env bash
# Double-click launcher (Docker, MODE RESEAU) : expose le tableau aux autres
# postes du réseau, via le front nginx (port 8080) UNIQUEMENT.
# Le middle (8787), la base (5432) et Adminer restent en loopback : tout
# accès passe par le front, en même origine.
# ATTENTION : pas d'authentification avant RP3 -> toute machine qui joint le
# port 8080 peut lire ET modifier le tableau. À réserver à un réseau
# restreint/maîtrisé. Arrêter avec "Arreter Docker.sh".
# Linux counterpart of "Lancer en Docker (reseau).cmd".
set -u
cd "$(dirname "$0")"

fail() { echo "$1"; [ -t 0 ] && read -rp "Appuyer sur Entrée pour fermer... "; exit 1; }

command -v docker >/dev/null 2>&1 \
  || fail "Docker est introuvable. Installer Docker Engine + le plugin compose, puis relancer."
docker info >/dev/null 2>&1 \
  || fail "Le démon Docker ne répond pas. Le démarrer (sudo systemctl start docker) ou vérifier que l'utilisateur est dans le groupe docker, puis relancer."

# --- MODE RESEAU : le front écoute sur toutes les interfaces ---
export FRONT_BIND=0.0.0.0

echo
echo "Construction et démarrage - base + middle + front - quelques minutes la 1re fois..."
docker compose -f docker/compose.yaml --profile app up -d --build \
  || fail "Le démarrage a échoué. Voir les messages ci-dessus."

# Pare-feu : rien n'est modifié par ce script. Si ufw est actif et bloque le
# port, autoriser une fois : sudo ufw allow 8080/tcp
echo
echo "[info] Si un pare-feu (ufw) est actif et que les autres postes ne"
echo "       joignent pas la page, exécuter UNE FOIS : sudo ufw allow 8080/tcp"

echo
echo "Adresses de ce poste - à communiquer aux utilisateurs :"
for ip in $(hostname -I 2>/dev/null); do
  case "$ip" in
    127.*|169.254*|*:*) ;;
    *) echo "  http://$ip:8080" ;;
  esac
done
echo
echo "  Sur ce poste  : http://localhost:8080"
echo "  Autres postes : une des adresses ci-dessus"
echo
echo "Rappel : PAS d'authentification (RP3 à venir) - réserver à un réseau restreint."
echo "Pour revenir en local seul : relancer \"Lancer en Docker.sh\" ou \"Arreter Docker.sh\"."
[ -t 0 ] && read -rp "Appuyer sur Entrée pour fermer... "
