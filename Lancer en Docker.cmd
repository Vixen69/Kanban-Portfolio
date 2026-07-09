@echo off
rem Double-click launcher (Docker, MODE DEMO) : base PostgreSQL + middle + front
rem + Adminer (editeur de base web), donnees de demonstration, puis navigateur.
rem MODE DEMO : le garde append-only de la base est DESACTIVE
rem (KANBAN_PG_APPEND_ONLY=0) pour permettre l'edition directe de la base.
rem En production, laisser ce drapeau a 1 (garde active). Necessite Docker Desktop.
rem Arreter avec "Arreter Docker.cmd".
title Portefeuille DSI - Kanban NMO (Docker, demo)
cd /d "%~dp0"

rem --- MODE DEMO : autorise l'edition directe de la base ---
set KANBAN_PG_APPEND_ONLY=0

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
echo Construction et demarrage ^(base + middle + front + Adminer, quelques minutes la 1re fois^)...
docker compose -f docker/compose.yaml --profile app --profile tools up -d --build
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
  set DATABASE_URL=postgres://kanban:thuglife@localhost:5432/kanban
  call node scripts/seed.ts
)

echo Ouverture du navigateur...
timeout /t 2 /nobreak >nul
start "" http://localhost:8080

echo.
echo   Tableau     : http://localhost:8080
echo   Editeur BD  : http://localhost:8081   ^(Systeme PostgreSQL, Serveur db, kanban / thuglife, base kanban^)
echo.
echo Conteneurs lances. Pour arreter : double-cliquer "Arreter Docker.cmd".
pause
