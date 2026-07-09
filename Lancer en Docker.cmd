@echo off
rem Double-click launcher (Docker) : construit et lance la base PostgreSQL, le
rem middle (Express) et le front (nginx), sème des donnees de demonstration,
rem puis ouvre le navigateur. Necessite Docker Desktop demarre.
rem Arreter avec "Arreter Docker.cmd".
title Portefeuille DSI - Kanban NMO (Docker)
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
echo Construction et demarrage ^(base PostgreSQL + middle + front, quelques minutes la 1re fois^)...
docker compose -f docker/compose.yaml --profile app up -d --build
if errorlevel 1 (
  echo Le demarrage a echoue. Voir les messages ci-dessus.
  pause
  exit /b 1
)

echo Attente de la base et du middle...
timeout /t 8 /nobreak >nul

where node >nul 2>nul
if not errorlevel 1 (
  echo Donnees de demonstration ^(idempotent^)...
  set KANBAN_ALLOW_SEED=1
  set KANBAN_STORAGE_DRIVER=postgres
  set DATABASE_URL=postgres://kanban:change-me-in-dev@localhost:5432/kanban
  call node scripts/seed.ts
)

echo Ouverture du navigateur sur http://localhost:8080 ...
timeout /t 2 /nobreak >nul
start "" http://localhost:8080

echo.
echo Conteneurs lances. Pour arreter : double-cliquer "Arreter Docker.cmd".
pause
