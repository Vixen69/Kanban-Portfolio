@echo off
rem Double-click : arrete les conteneurs Docker du tableau (garde les images
rem et les volumes db-data/config-data). Relancer avec "Lancer en Docker.cmd".
title Portefeuille DSI - Kanban NMO (Docker) - Arret
cd /d "%~dp0"

echo Arret des conteneurs...
docker compose -f docker/compose.yaml --profile app --profile tools down

echo.
echo Termine. Les images et les volumes ^(db-data, config-data^) sont conserves.
pause
