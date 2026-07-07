@echo off
rem Double-click : arrete les conteneurs Docker du tableau (garde les images
rem et les donnees docker/data). Relancer avec "Lancer en Docker.cmd".
title Portefeuille DSI - Kanban NMO (Docker) - Arret
cd /d "%~dp0"

echo Arret des conteneurs...
docker compose -f docker/compose.yaml --profile app down

echo.
echo Termine. Les images et les donnees ^(docker\data^) sont conservees.
pause
