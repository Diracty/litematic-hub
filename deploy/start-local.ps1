#Requires -Version 5.1
<#
.SYNOPSIS
  Локальный запуск Litematic Hub без Replit (Windows + pnpm + Docker только для PostgreSQL).

.EXAMPLE
  .\deploy\start-local.ps1
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

function Test-Command($Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

if (-not (Test-Command pnpm)) {
    throw "pnpm не найден. Установите: npm install -g pnpm"
}

if (-not (Test-Command docker)) {
    throw "Docker не найден. Установите Docker Desktop: https://www.docker.com/products/docker-desktop/"
}

$EnvFile = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $EnvFile)) {
    Copy-Item (Join-Path $PSScriptRoot ".env.example") $EnvFile
    Write-Host "Создан deploy\.env из .env.example"
}

Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
        Set-Item -Path "env:$($Matches[1].Trim())" -Value $Matches[2].Trim()
    }
}

$AppPort = if ($env:APP_PORT) { $env:APP_PORT } else { "8080" }
$PgUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "litematic" }
$PgPass = if ($env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD } else { "litematic" }
$PgDb = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "litematic" }

Write-Host "Запуск PostgreSQL в Docker..."
docker compose -f (Join-Path $PSScriptRoot "docker-compose.yml") up -d db

$env:DATABASE_URL = "postgres://${PgUser}:${PgPass}@localhost:5432/${PgDb}"
$env:PORT = $AppPort
$env:BASE_PATH = "/"
$env:STATIC_DIR = (Join-Path $ProjectRoot "artifacts\litematic-hub\dist\public")

Write-Host "Установка зависимостей..."
pnpm install

Write-Host "Сборка фронтенда и API..."
$env:PORT = "5173"
$env:BASE_PATH = "/"
pnpm --filter @workspace/litematic-hub run build
pnpm --filter @workspace/api-server run build

Write-Host "Применение схемы БД..."
pnpm --filter @workspace/db run push

$env:PORT = $AppPort
Write-Host ""
Write-Host "Готово! Откройте http://localhost:$AppPort"
Write-Host "Остановка: Ctrl+C"
Write-Host ""

node --enable-source-maps (Join-Path $ProjectRoot "artifacts\api-server\dist\index.mjs")
