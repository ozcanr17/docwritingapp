#Requires -Version 5.1
$ErrorActionPreference = "SilentlyContinue"

$Root = (Resolve-Path "$PSScriptRoot\..\..").Path
$PidFile = Join-Path $Root ".dev-pids"
$ComposeFile = Join-Path $Root "infra\docker\docker-compose.dev.yml"

Write-Host "==> Stopping DocSys application services"
if (Test-Path $PidFile) {
  Get-Content $PidFile | Where-Object { $_ } | ForEach-Object {
    Stop-Process -Id ([int]$_) -Force -ErrorAction SilentlyContinue
  }
  Remove-Item $PidFile -Force
}

if ($env:STOP_INFRA -eq "1") {
  Write-Host "==> Stopping docker infrastructure (postgres, redis, minio)"
  docker compose -f $ComposeFile stop | Out-Null
}

Write-Host "==> Done."
Write-Host "    To also stop docker infra:  `$env:STOP_INFRA=1; powershell -File infra\scripts\dev-down.ps1"
