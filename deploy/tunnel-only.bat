@echo off
chcp 65001 >nul
echo.
echo ========================================
echo   Cloudflare tunnel only
echo ========================================
echo.
echo Docker dolzhen uzhe rabotat na :8080
echo Otkrojte snachala: http://localhost:8080
echo.
echo NE ZAKRYVAJTE eto okno!
echo.
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0host-public.ps1" -TunnelOnly
echo.
pause
