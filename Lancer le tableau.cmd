@echo off
rem Double-click launcher: fixtures + API + front + browser.
rem Equivalent to `npm start` (scripts/dev.ts). Ctrl+C or close the window to stop.
title Portefeuille DSI - Kanban NMO
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est introuvable. Installer Node 22 ^(https://nodejs.org^) puis relancer.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Premiere utilisation : installation des dependances...
  call npm ci
  if errorlevel 1 (
    echo L'installation a echoue. Voir les messages ci-dessus.
    pause
    exit /b 1
  )
)

echo Demarrage du tableau ^(le navigateur s'ouvre automatiquement^)...
echo Fermer cette fenetre ou Ctrl+C pour arreter.
call npm start
pause
