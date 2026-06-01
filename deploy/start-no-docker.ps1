param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$DeployDir = $PSScriptRoot
$ProjectRoot = Split-Path -Parent $DeployDir
$EnvFile = Join-Path $DeployDir ".env"

function Write-Step($Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-Command($Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Find-Node {
    $fromPath = Get-Command node -ErrorAction SilentlyContinue
    $candidates = @()
    if ($fromPath) { $candidates += $fromPath.Source }
    $candidates += @(
        "$env:ProgramFiles\nodejs\node.exe",
        "$env:LocalAppData\Programs\node\node.exe"
    )

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) { return $candidate }
    }

    throw "Node.js not found. Install from https://nodejs.org/"
}

function Find-Pnpm {
    $fromPath = Get-Command pnpm -ErrorAction SilentlyContinue
    if ($fromPath) { return $fromPath.Source }

    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if ($npm) {
        Write-Step "Installing pnpm..."
        & $npm.Source install -g pnpm
        $fromPath = Get-Command pnpm -ErrorAction SilentlyContinue
        if ($fromPath) { return $fromPath.Source }
    }

    throw "pnpm not found. Run: npm install -g pnpm"
}

function Load-EnvFile {
    if (-not (Test-Path $EnvFile)) {
        Copy-Item (Join-Path $DeployDir ".env.example") $EnvFile
        Write-Host "Created deploy\.env - add DATABASE_URL from https://neon.tech"
    }

    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)=(.*)$') {
            Set-Item -Path "env:$($Matches[1].Trim())" -Value $Matches[2].Trim()
        }
    }
}

function Ensure-DatabaseUrl {
    if (-not $env:DATABASE_URL) {
        throw @"
DATABASE_URL is not set in deploy\.env

Without Docker you need a free cloud database:
  1. Open https://neon.tech and create a free account
  2. Create a project -> Connection string
  3. Add to deploy\.env:
     DATABASE_URL=postgres://...

Or use Replit / Docker instead.
"@
    }
}

function Build-App {
    if ($SkipBuild) { return }

    $node = Find-Node
    $pnpm = Find-Pnpm
    Set-Location $ProjectRoot

    Write-Step "Installing dependencies..."
    & $pnpm install

    Write-Step "Building frontend and API..."
    $env:PORT = "5173"
    $env:BASE_PATH = "/"
    & $pnpm --filter @workspace/litematic-hub run build
    & $pnpm --filter @workspace/api-server run build

    Write-Step "Applying database schema..."
    & $pnpm --filter @workspace/db run push
}

function Get-AppPort {
    if ($env:APP_PORT) { return [int]$env:APP_PORT }
    return 8080
}

Load-EnvFile
Ensure-DatabaseUrl

$AppPort = Get-AppPort
$env:PORT = "$AppPort"
$env:BASE_PATH = "/"
$env:STATIC_DIR = Join-Path $ProjectRoot "artifacts\litematic-hub\dist\public"

Build-App

$NodeExe = Find-Node
$ServerEntry = Join-Path $ProjectRoot "artifacts\api-server\dist\index.mjs"

Write-Host ""
Write-Host "Ready! Local: http://localhost:$AppPort" -ForegroundColor Green
Write-Host "Stop: Ctrl+C"
Write-Host ""

& $NodeExe --enable-source-maps $ServerEntry
