#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$Root = (Resolve-Path "$PSScriptRoot\..\..").Path
Set-Location $Root

function DefaultEnv([string]$name, [string]$value) {
  if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
    Set-Item -Path "Env:$name" -Value $value
  }
}

DefaultEnv "DATABASE_URL" "postgresql://docsys:docsys@localhost:5432/docsys"
DefaultEnv "REDIS_URL" "redis://localhost:6379"
DefaultEnv "JWT_SECRET" "dev-secret-at-least-16-chars"
DefaultEnv "APP_BASE_URL" "http://localhost:5173"
DefaultEnv "CORS_ALLOWED_ORIGINS" "http://localhost:5173"
DefaultEnv "S3_ENDPOINT" "http://localhost:9000"
DefaultEnv "S3_REGION" "us-east-1"
DefaultEnv "S3_BUCKET" "docsys"
DefaultEnv "S3_ACCESS_KEY" "minioadmin"
DefaultEnv "S3_SECRET_KEY" "minioadmin"
DefaultEnv "COLLAB_PORT" "3002"
DefaultEnv "WORKER_HEALTH_PORT" "3003"
DefaultEnv "LOG_LEVEL" "warn"

$LogDir = Join-Path $Root ".dev-logs"
$PidFile = Join-Path $Root ".dev-pids"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Content -Path $PidFile -Value ""

$ComposeFile = Join-Path $Root "infra\docker\docker-compose.dev.yml"

function Test-Port([int]$port) {
  try {
    $c = New-Object Net.Sockets.TcpClient
    $c.Connect("127.0.0.1", $port)
    $c.Close()
    return $true
  } catch {
    return $false
  }
}

function Start-App([string]$name, [string]$dir, [string]$command) {
  $out = Join-Path $LogDir "$name.log"
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $command `
    -WorkingDirectory (Join-Path $Root $dir) -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $out -RedirectStandardError (Join-Path $LogDir "$name.err.log")
  Add-Content -Path $PidFile -Value $p.Id
  Write-Host "  started $name (pid $($p.Id), logs: .dev-logs\$name.log)"
}

Write-Host "==> DocSys dev launcher (Windows)"

Write-Host "==> Checking infrastructure via Docker"
if (-not (docker info 2>$null)) {
  Write-Error "Docker is not running. Start Docker Desktop and re-run."
  exit 1
}
docker compose -f $ComposeFile up -d postgres redis minio | Out-Null

Write-Host "==> Waiting for PostgreSQL"
for ($i = 0; $i -lt 60; $i++) {
  if (Test-Port 5432) { break }
  Start-Sleep -Seconds 1
}

Write-Host "==> Installing dependencies and building shared packages"
pnpm install | Out-File (Join-Path $LogDir "install.log")
pnpm --filter "@docsys/database" generate | Out-File (Join-Path $LogDir "prisma.log")
pnpm --filter "@docsys/database" build | Out-File (Join-Path $LogDir "prisma.log") -Append
Push-Location (Join-Path $Root "packages\database")
npx prisma migrate deploy | Out-File (Join-Path $LogDir "prisma.log") -Append
Pop-Location
Push-Location (Join-Path $Root "apps\api")
npx tsc -p tsconfig.json | Out-File (Join-Path $LogDir "api-build.log")
Pop-Location

Write-Host "==> Starting application services"
Start-App "api" "apps\api" "node dist\main.js"
Start-App "collaboration" "apps\collaboration" "npx tsx src\main.ts"
Start-App "worker" "apps\worker" "npx tsx src\main.ts"
Start-App "web" "apps\web" "npx vite --port 5173 --host"

Write-Host "==> Waiting for API"
for ($i = 0; $i -lt 60; $i++) {
  try { if ((Invoke-WebRequest -UseBasicParsing "http://localhost:3001/health/live").StatusCode -eq 200) { break } } catch {}
  Start-Sleep -Seconds 1
}

Write-Host "==> Seeding admin account"
node (Join-Path $Root "infra\scripts\seed-admin.mjs")

Write-Host ""
Write-Host "DocSys is running:"
Write-Host "  Web UI:        $env:APP_BASE_URL"
Write-Host "  API / Swagger: http://localhost:3001/api/docs"
Write-Host "  Login:         admin@docsys.local / Admin1234!"
Write-Host ""
Write-Host "Stop everything with:  powershell -File infra\scripts\dev-down.ps1"
