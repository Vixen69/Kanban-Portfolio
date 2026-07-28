#!/usr/bin/env bash
# Local pre-container gate on the developer machine: conventions, typecheck,
# tests, front build, SBOM. Delivery to the client platform is by container
# image (ADR 011) — this is the check run before building/pushing that image.
set -euo pipefail
cd "$(dirname "$0")"

echo "== 1/6 install (npm ci) =="
npm ci --no-audit --no-fund

echo "== 2/6 conventions (lint minimal) =="
npm run -s conventions

echo "== 3/6 typecheck (core + middle + front) =="
npm run -s typecheck

echo "== 4/6 tests (node:test, dont les frontieres d'architecture) =="
npm run -s test

echo "== 5/6 build (front) =="
npm run -s build
test -f front/dist/index.html || { echo "✗ build incomplet: front/dist/index.html manquant"; exit 1; }
grep -q "Portefeuille" front/dist/index.html || { echo "✗ smoke: titre absent de front/dist/index.html"; exit 1; }

echo "== 6/6 SBOM =="
npm run -s sbom

echo "✓ verify.sh : tout est vert"
