param(
    [switch]$TunnelOnly,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$DeployDir = $PSScriptRoot
$ProjectRoot = Split-Path -Parent $DeployDir
$Port = 8080
$Cloudflared = Join-Path $DeployDir "cloudflared.exe"
$CloudflaredUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
$EnvFile = Join-Path $DeployDir ".env"
$ServerEntry = Join-Path $ProjectRoot "artifacts\api-server\dist\index.mjs"

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
        Write-Host "Created deploy\.env - add DATABASE_URL from https://neon.tech"
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

    for ($i = 1; $i -le 120; $i++) {
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

    throw "App did not start on port $Port."
}

function Build-AppInline {
    if ($SkipBuild) { return }

    $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
    if (-not $pnpm) {
        $npm = Get-Command npm -ErrorAction SilentlyContinue
        if ($npm) {
            & $npm.Source install -g pnpm
        } else {
            throw "Install Node.js from https://nodejs.org/ then: npm install -g pnpm"
        }
    }

    Set-Location $ProjectRoot
    Write-Step "Installing dependencies..."
    pnpm install

    Write-Step "Building frontend and API..."
    $env:PORT = "5173"
    $env:BASE_PATH = "/"
    pnpm --filter @workspace/litematic-hub run build
    pnpm --filter @workspace/api-server run build

    Write-Step "Applying database schema..."
    pnpm --filter @workspace/db run push
}

function Start-AppProcess {
    $node = Find-Node
    $env:PORT = "$Port"
    $env:BASE_PATH = "/"
    $env:STATIC_DIR = Join-Path $ProjectRoot "artifacts\litematic-hub\dist\public"

    if (-not (Test-Path $ServerEntry)) {
        throw "API not built. Run without -SkipBuild first."
    }

    Write-Step "Starting app (Node.js, no Docker)..."
    $global:AppProcess = Start-Process -FilePath $node `
        -ArgumentList @("--enable-source-maps", $ServerEntry) `
        -WorkingDirectory $ProjectRoot `
        -PassThru `
        -WindowStyle Hidden

    Wait-ForApp
}

function Stop-AppProcess {
    if ($global:AppProcess -and -not $global:AppProcess.HasExited) {
        Write-Host "Stopping app..."
        Stop-Process -Id $global:AppProcess.Id -Force -ErrorAction SilentlyContinue
    }
}

Stop-StaleCloudflared
Load-EnvFile
Ensure-Cloudflared

try {
    if (-not $TunnelOnly) {
        if (-not $env:DATABASE_URL) {
            throw "Set DATABASE_URL in deploy\.env (free: https://neon.tech)"
        }
        Build-AppInline
        Start-AppProcess
    } else {
        Wait-ForApp
    }

    Write-Step "Starting free public tunnel (Cloudflare)..."
    Write-Host ""
    Write-Host "Keep this window open while others use your API." -ForegroundColor Yellow
    Write-Host "Public URL will appear below in ~10 seconds." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "API for your server:" -ForegroundColor Green
    Write-Host "  https://....trycloudflare.com/api/info/{key}"
    Write-Host "  https://....trycloudflare.com/api/part/{key}/{number}"
    Write-Host ""

    & $Cloudflared tunnel --protocol http2 --url "http://127.0.0.1:$Port"
} finally {
    Stop-AppProcess
}
