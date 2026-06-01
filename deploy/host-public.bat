@echo off
chcp 65001 >nul
echo.
echo ========================================
echo   Litematic Hub - Docker + public URL
echo ========================================
echo.
echo 1. Docker Desktop dolzhen byt zapuschen
echo 2. Pervyj zapusk mozhet zanyat 5-15 minut
echo 3. Ne zakryvajte eto okno
echo.
echo Instrukciya: deploy\DOCKER-START.md
echo.
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0host-public.ps1"
echo.
pause
