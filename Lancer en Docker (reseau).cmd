@echo off
rem Double-click launcher (Docker, MODE RESEAU) : expose le tableau aux autres
rem postes du reseau, via le front nginx (port 8080) UNIQUEMENT.
rem Le middle (8787), la base (5432) et Adminer restent en loopback : tout
rem acces passe par le front, en meme origine.
rem ATTENTION : pas d'authentification avant RP3 -> toute machine qui joint le
rem port 8080 peut lire ET modifier le tableau. A reserver a un reseau
rem restreint/maitrise. Arreter avec "Arreter Docker.cmd".
title Portefeuille DSI - Kanban NMO (Docker, reseau)
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

rem --- MODE RESEAU : le front ecoute sur toutes les interfaces ---
set FRONT_BIND=0.0.0.0

echo.
echo Construction et demarrage - base + middle + front - quelques minutes la 1re fois...
docker compose -f docker/compose.yaml --profile app up -d --build
if errorlevel 1 (
  echo Le demarrage a echoue. Voir les messages ci-dessus.
  pause
  exit /b 1
)

rem Regle de pare-feu entrante pour 8080 (peut exiger des droits admin ;
rem toleree en echec : Docker Desktop route souvent deja le trafic publie).
netsh advfirewall firewall show rule name="Kanban NMO front 8080" >nul 2>nul
if errorlevel 1 (
  netsh advfirewall firewall add rule name="Kanban NMO front 8080" dir=in action=allow protocol=TCP localport=8080 >nul 2>nul
  if errorlevel 1 (
    echo [info] Regle de pare-feu non ajoutee ^(droits administrateur requis^).
    echo        Si les autres postes ne joignent pas la page, executer UNE FOIS
    echo        dans une invite ADMINISTRATEUR :
    echo        netsh advfirewall firewall add rule name="Kanban NMO front 8080" dir=in action=allow protocol=TCP localport=8080
  )
)

echo.
echo Adresses de ce poste - a communiquer aux utilisateurs :
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {$_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254*'} | ForEach-Object { '  http://' + $_.IPAddress + ':8080' }"
echo.
echo   Sur ce poste  : http://localhost:8080
echo   Autres postes : une des adresses ci-dessus
echo.
echo Rappel : PAS d'authentification ^(RP3 a venir^) - reserver a un reseau restreint.
echo Pour revenir en local seul : relancer "Lancer en Docker.cmd" ou "Arreter Docker.cmd".
pause
