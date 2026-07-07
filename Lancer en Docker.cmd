@echo off
rem Double-click launcher (Docker) : construit et lance les conteneurs
rem front (nginx) + middle (Express), puis ouvre le navigateur.
rem Necessite Docker Desktop demarre. Arreter avec "Arreter Docker.cmd".
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

if not exist "docker\data\board.jsonl" (
  echo Premiere utilisation : donnees de demonstration...
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js introuvable pour semer les donnees ^: le tableau demarrera vide.
  ) else (
    set KANBAN_ALLOW_SEED=1
    set KANBAN_DATA_PATH=docker/data/board.jsonl
    call node scripts/seed.ts
  )
)

echo.
echo Construction et demarrage des conteneurs ^(quelques minutes la 1re fois^)...
docker compose -f docker/compose.yaml --profile app up -d --build
if errorlevel 1 (
  echo Le demarrage a echoue. Voir les messages ci-dessus.
  pause
  exit /b 1
)

echo Ouverture du navigateur sur http://localhost:8080 ...
timeout /t 4 /nobreak >nul
start "" http://localhost:8080

echo.
echo Conteneurs lances. Pour arreter : double-cliquer "Arreter Docker.cmd".
pause
