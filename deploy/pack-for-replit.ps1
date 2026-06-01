#Requires -Version 5.1
<#
.SYNOPSIS
  Creates litematic-hub-replit.zip for uploading to Replit.
#>
$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DeployDir = $PSScriptRoot
$ZipPath = Join-Path $DeployDir "litematic-hub-replit.zip"
$Staging = Join-Path $env:TEMP "litematic-replit-pack"

if (Test-Path $Staging) { Remove-Item $Staging -Recurse -Force }
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }

New-Item -ItemType Directory -Path $Staging | Out-Null

$ExcludeDirs = @(
    "node_modules",
    "dist",
    ".git",
    ".agents",
    "deploy\cloudflared.exe"
)

$ExcludePatterns = @(
    "*.tsbuildinfo",
    "deploy\litematic-hub-replit.zip"
)

Write-Host "Copying project files..."
Get-ChildItem -Path $ProjectRoot -Force | ForEach-Object {
    $name = $_.Name
    if ($name -in @("node_modules", ".git", ".agents")) { return }

    if ($_.PSIsContainer) {
        if ($name -eq "deploy") {
            New-Item -ItemType Directory -Path (Join-Path $Staging "deploy") | Out-Null
            Get-ChildItem $_.FullName -File | Where-Object {
                $_.Name -notin @("cloudflared.exe", "litematic-hub-replit.zip")
            } | Copy-Item -Destination (Join-Path $Staging "deploy")
        } else {
            robocopy $_.FullName (Join-Path $Staging $name) /E /XD node_modules dist .git /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
            if ($LASTEXITCODE -ge 8) { throw "robocopy failed for $name" }
        }
    } else {
        Copy-Item $_.FullName -Destination $Staging
    }
}

Write-Host "Creating zip..."
Compress-Archive -Path (Join-Path $Staging "*") -DestinationPath $ZipPath -Force
Remove-Item $Staging -Recurse -Force

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
Write-Host "File: $ZipPath"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Open https://replit.com"
Write-Host "  2. Create Repl -> Import -> upload litematic-hub-replit.zip"
Write-Host "  3. Add PostgreSQL (Tools -> Database)"
Write-Host "  4. Run -> Deploy -> Publish"
Write-Host ""
Write-Host "Full guide: deploy\REPLIT-FREE.md"
