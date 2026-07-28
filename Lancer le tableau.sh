#!/usr/bin/env bash
# Double-click launcher: fixtures + API + front + browser.
# Equivalent to `npm start` (scripts/dev.ts). Ctrl+C or close the window to stop.
# Linux counterpart of "Lancer le tableau.cmd".
set -u
cd "$(dirname "$0")"

fail() { echo "$1"; [ -t 0 ] && read -rp "Appuyer sur Entrée pour fermer... "; exit 1; }

# VM sans droits admin : Node peut être extrait dans le HOME (node-v22.x/bin)
# avec le PATH posé dans ~/.bashrc — que le double-clic ne lit JAMAIS (shell
# non interactif). On complète donc le PATH nous-mêmes, dernière version en tête.
if ! command -v node >/dev/null 2>&1; then
  NODE_HOME="$(ls -d "$HOME"/node-v*/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "${NODE_HOME:-}" ] && export PATH="$NODE_HOME:$PATH"
fi

command -v node >/dev/null 2>&1 \
  || fail "Node.js est introuvable (ni dans le PATH, ni dans \$HOME/node-v*). Installer Node 22 (https://nodejs.org) puis relancer."

if [ ! -d node_modules ]; then
  echo "Première utilisation : installation des dépendances..."
  npm ci || fail "L'installation a échoué. Voir les messages ci-dessus."
fi

echo "Démarrage du tableau (le navigateur s'ouvre automatiquement)..."
echo "Fermer cette fenêtre ou Ctrl+C pour arrêter."
npm start
