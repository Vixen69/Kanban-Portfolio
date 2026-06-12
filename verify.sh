#!/usr/bin/env bash
# Full verification — must pass identically on the personal machine and on
# the client-side machine (offline).
# Mandated order: install, lint/conventions, typecheck, tests, build, SBOM.
set -euo pipefail
cd "$(dirname "$0")"

echo "== 1/6 install (npm ci) =="
if [ -d vendor ] && ls vendor/*.tgz >/dev/null 2>&1; then
  # Offline: rebuild the npm cache from the vendored tarballs.
  export npm_config_cache="$PWD/.npm-offline"
  mkdir -p "$npm_config_cache"
  for tgz in vendor/*.tgz; do
    npm cache add "$tgz" >/dev/null
  done
  npm ci --offline --no-audit --no-fund
else
  echo "(vendor/ absent — install en ligne, machine de developpement uniquement)"
  npm ci --no-audit --no-fund
fi

echo "== 2/6 conventions (lint minimal) =="
npm run -s conventions

echo "== 3/6 typecheck =="
npm run -s typecheck

echo "== 4/6 tests =="
npm run -s test

echo "== 5/6 build =="
npm run -s build
test -f dist/index.html || { echo "✗ build incomplet: dist/index.html manquant"; exit 1; }
grep -q "Portefeuille" dist/index.html || { echo "✗ smoke: titre absent de dist/index.html"; exit 1; }

echo "== 6/6 SBOM =="
npm run -s sbom

echo "✓ verify.sh : tout est vert"
