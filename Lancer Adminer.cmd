@echo off
rem Double-click launcher : Adminer seul (editeur de base web) + PostgreSQL.
rem Ne demarre PAS le tableau (middle/front) — pour la pile complete de demo,
rem utiliser "Lancer en Docker.cmd". Necessite Docker Desktop.
rem L'edition des cartes/evenements se fait par champs (plugin card-boxes) ;
rem repli JSON brut disponible dans chaque fiche.
title Portefeuille DSI - Adminer (editeur BD)
cd /d "%~dp0"

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker est introuvable. Installer et demarrer Docker Desktop, puis relancer.
  pause
  exit /b 1
)

docker info >nul 2>nul
if errorlevel 1 (
  echo Docker Desktop ne repond pas. Le demarrer ^(attendre l'etat "running"^) puis relancer.
  pause
  exit /b 1
)

echo.
echo Demarrage de la base et d'Adminer...
docker compose -f docker/compose.yaml --profile app --profile tools up -d db adminer
if errorlevel 1 (
  echo Le demarrage a echoue. Voir les messages ci-dessus.
  pause
  exit /b 1
)

echo Ouverture du navigateur...
timeout /t 2 /nobreak >nul
start "" http://localhost:8081

echo.
echo   Editeur BD  : http://localhost:8081
echo   Connexion   : Systeme PostgreSQL, Serveur db, kanban / thuglife, base kanban
echo   Edition par champs des tables cards et card_events ^(repli JSON brut dans la fiche^).
echo.
echo Base vide ? Lancer d'abord "Lancer en Docker.cmd" ^(donnees de demonstration^).
echo Pour arreter : double-cliquer "Arreter Docker.cmd".
pause
