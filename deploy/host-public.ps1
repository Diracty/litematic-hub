param(
    [switch]$TunnelOnly
)

$ErrorActionPreference = "Stop"

$DeployDir = $PSScriptRoot
$ProjectRoot = Split-Path -Parent $DeployDir
$Port = 8080
$Cloudflared = Join-Path $DeployDir "cloudflared.exe"
$CloudflaredUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
$EnvFile = Join-Path $DeployDir ".env"
$ComposeFile = Join-Path $DeployDir "docker-compose.yml"

function Write-Step($Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-Command($Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Stop-StaleCloudflared {
    Get-Process cloudflared -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "Stopping old cloudflared (PID $($_.Id))..."
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
}

function Ensure-Cloudflared {
    if (Test-Path $Cloudflared) { return }

    Write-Step "Downloading cloudflared (free tunnel, ~20 MB)..."
    Invoke-WebRequest -Uri $CloudflaredUrl -OutFile "$Cloudflared.download" -UseBasicParsing
    Move-Item -Force "$Cloudflared.download" $Cloudflared
}

function Load-EnvFile {
    if (-not (Test-Path $EnvFile)) {
        Copy-Item (Join-Path $DeployDir ".env.example") $EnvFile
        Write-Host "Created deploy\.env from .env.example"
    }

    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)=(.*)$') {
            Set-Item -Path "env:$($Matches[1].Trim())" -Value $Matches[2].Trim()
        }
    }

    if ($env:APP_PORT) {
        $script:Port = [int]$env:APP_PORT
    }
}

function Wait-ForApp {
    $healthUrl = "http://127.0.0.1:$Port/api/healthz"
    Write-Step "Waiting for app at $healthUrl ..."

    for ($i = 1; $i -le 90; $i++) {
        try {
            $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -eq 200) {
                Write-Host "App is ready."
                return
            }
        } catch {
            Start-Sleep -Seconds 2
        }
    }

    throw "App did not start on port $Port. Check Docker logs: docker compose -f deploy/docker-compose.yml logs app"
}

function Start-AppWithDocker {
    if (-not (Test-Command docker)) {
        throw @"
Docker not found.

Install Docker Desktop (free):
  https://www.docker.com/products/docker-desktop/

Or start the app manually on port $Port, then run:
  .\deploy\host-public.ps1 -TunnelOnly
"@
    }

    Write-Step "Starting Litematic Hub with Docker..."
    Set-Location $ProjectRoot
    docker compose -f $ComposeFile up --build -d
    Wait-ForApp
}

Stop-StaleCloudflared
Load-EnvFile
Ensure-Cloudflared

if (-not $TunnelOnly) {
    Start-AppWithDocker
} else {
    Wait-ForApp
}

Write-Step "Starting free public tunnel (Cloudflare)..."
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  DO NOT CLOSE THIS WINDOW!" -ForegroundColor Yellow
Write-Host "  DO NOT press Ctrl+C" -ForegroundColor Yellow
Write-Host "  Copy the https://....trycloudflare.com link from the box below" -ForegroundColor Yellow
Write-Host "  If you use VPN - turn it OFF (causes tunnel errors)" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Your server should call:" -ForegroundColor Green
Write-Host "  https://....trycloudflare.com/api/info/{key}"
Write-Host "  https://....trycloudflare.com/api/part/{key}/{number}"
Write-Host ""

    & $Cloudflared tunnel --protocol http2 --url "http://127.0.0.1:$Port"
