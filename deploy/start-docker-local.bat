@echo off
chcp 65001 >nul
echo.
echo ========================================
echo   Litematic Hub - tolko localhost
echo ========================================
echo.
echo Otkroetsya: http://localhost:8080
echo Instrukciya: deploy\DOCKER-START.md
echo.
cd /d "%~dp0.."
if not exist deploy\.env copy deploy\.env.example deploy\.env
docker compose -f deploy/docker-compose.yml up --build -d
if errorlevel 1 (
    echo.
    echo Oshibka. Proverite chto Docker Desktop zapuschen.
    pause
    exit /b 1
)
echo.
echo Gotovo! Otkrojte http://localhost:8080
echo Ostanovit: docker compose -f deploy/docker-compose.yml down
echo.
pause
