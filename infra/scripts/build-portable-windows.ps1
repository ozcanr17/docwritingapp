param(
  [string]$OutputDirectory = "dist-portable"
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$cache = Join-Path $repo ".build-cache\portable"
$stage = Join-Path $cache "stage"
$downloads = Join-Path $cache "downloads"
$deploy = Join-Path $cache "deploy"
$output = Join-Path $repo $OutputDirectory

function Invoke-Checked([string]$File, [string[]]$Arguments, [string]$WorkingDirectory = $repo) {
  Push-Location $WorkingDirectory
  try {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "$File failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

function Get-Download([string]$Url, [string]$Path, [string]$Sha256) {
  if (-not (Test-Path $Path)) {
    Invoke-WebRequest -Uri $Url -OutFile $Path -UseBasicParsing
  }
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
  if ($actual -ne $Sha256.ToLowerInvariant()) {
    throw "Checksum mismatch for $Path. Expected $Sha256, got $actual"
  }
}

function Reset-Directory([string]$Path) {
  if (Test-Path $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
  New-Item -ItemType Directory -Path $Path | Out-Null
}

New-Item -ItemType Directory -Force -Path $cache, $downloads, $output | Out-Null

$env:DATABASE_URL = "postgresql://docsys:docsys@127.0.0.1:45432/docsys"
Invoke-Checked "corepack" @("pnpm@9.15.9", "install", "--frozen-lockfile")
Invoke-Checked "corepack" @("pnpm@9.15.9", "--filter", "@docsys/database", "generate")
foreach ($package in @("@docsys/database", "@docsys/config", "@docsys/api", "@docsys/collaboration", "@docsys/worker")) {
  Invoke-Checked "corepack" @("pnpm@9.15.9", "--filter", $package, "build")
}

Reset-Directory $deploy
Invoke-Checked "corepack" @("pnpm@9.15.9", "--config.node-linker=hoisted", "--filter", "@docsys/portable", "deploy", "--prod", $deploy)
$generatedPrismaClient = Get-ChildItem (Join-Path $repo "node_modules\.pnpm") -Directory -Filter "@prisma+client@*" |
  ForEach-Object { Join-Path $_.FullName "node_modules\.prisma\client" } |
  Where-Object { Test-Path (Join-Path $_ "query_engine-windows.dll.node") } |
  Select-Object -First 1
if (-not $generatedPrismaClient) {
  throw "Generated Prisma client was not found"
}
New-Item -ItemType Directory -Force -Path (Join-Path $deploy "node_modules\.prisma") | Out-Null
Copy-Item -Recurse -Force $generatedPrismaClient (Join-Path $deploy "node_modules\.prisma\client")
Reset-Directory $stage

$nodeArchive = Join-Path $downloads "node-v22.23.1-win-x64.zip"
$postgresArchive = Join-Path $downloads "postgresql-16.13-1-windows-x64-binaries.zip"
$redisArchive = Join-Path $downloads "Redis-8.8.0-Windows-x64-msys2.zip"
$minioBinary = Join-Path $downloads "minio.exe"
$goArchive = Join-Path $downloads "go1.26.5.windows-amd64.zip"

Get-Download "https://nodejs.org/download/release/v22.23.1/node-v22.23.1-win-x64.zip" $nodeArchive "7df0bc9375723f4a86b3aa1b7cc73342423d9677a8df4538aca31a049e309c29"
Get-Download "https://get.enterprisedb.com/postgresql/postgresql-16.13-1-windows-x64-binaries.zip" $postgresArchive "9b4c7a1bc31147b5b2ba59178d0eef86c16181d54a20177192b387dff20f00a9"
Get-Download "https://github.com/redis-windows/redis-windows/releases/download/8.8.0/Redis-8.8.0-Windows-x64-msys2.zip" $redisArchive "8af6fd6c4aac3e13ded36f249da8114b3be32df60ab589da7c3513aa8b1a86cd"
Get-Download "https://dl.min.io/server/minio/release/windows-amd64/minio.exe" $minioBinary "af709e6ba68488404e85acdd22a3030d0f5e56a108d4b27d744f18ceb50861b4"
Get-Download "https://go.dev/dl/go1.26.5.windows-amd64.zip" $goArchive "97e6b2a833b6d89f9ff17d25419ac0a7e3b482a044e9ab18cdef834bd834fd38"

$nodeExtract = Join-Path $cache "node-extract"
$postgresExtract = Join-Path $cache "postgres-extract"
$redisExtract = Join-Path $cache "redis-extract"
$goExtract = Join-Path $cache "go-extract"
foreach ($item in @($nodeExtract, $postgresExtract, $redisExtract, $goExtract)) {
  Reset-Directory $item
}
Invoke-Checked "tar.exe" @("-xf", $nodeArchive, "-C", $nodeExtract)
Invoke-Checked "tar.exe" @("-xf", $postgresArchive, "-C", $postgresExtract, "pgsql/bin", "pgsql/lib", "pgsql/share")
Invoke-Checked "tar.exe" @("-xf", $redisArchive, "-C", $redisExtract)
Invoke-Checked "tar.exe" @("-xf", $goArchive, "-C", $goExtract)

Copy-Item -Recurse -Force (Join-Path $nodeExtract "node-v22.23.1-win-x64") (Join-Path $stage "node")
New-Item -ItemType Directory -Force -Path (Join-Path $stage "postgres") | Out-Null
foreach ($item in @("bin", "lib", "share")) {
  Copy-Item -Recurse -Force (Join-Path $postgresExtract "pgsql\$item") (Join-Path $stage "postgres\$item")
}
New-Item -ItemType Directory -Force -Path (Join-Path $stage "redis") | Out-Null
$redisRoot = Get-ChildItem -LiteralPath $redisExtract -Directory |
  Where-Object { Test-Path (Join-Path $_.FullName "redis-server.exe") } |
  Select-Object -First 1
if (-not $redisRoot) {
  throw "Redis server binary was not found"
}
Copy-Item -Recurse -Force (Join-Path $redisRoot.FullName "*") (Join-Path $stage "redis")
New-Item -ItemType Directory -Force -Path (Join-Path $stage "minio") | Out-Null
Copy-Item -Force $minioBinary (Join-Path $stage "minio\minio.exe")
Copy-Item -Recurse -Force $deploy (Join-Path $stage "app")
Copy-Item -Force (Join-Path $repo "infra\scripts\seed-admin.mjs") (Join-Path $stage "app\seed-admin.mjs")
New-Item -ItemType Directory -Force -Path (Join-Path $stage "database") | Out-Null
Copy-Item -Force (Join-Path $repo "packages\database\prisma\schema.prisma") (Join-Path $stage "database\schema.prisma")
Copy-Item -Recurse -Force (Join-Path $repo "packages\database\prisma\migrations") (Join-Path $stage "database\migrations")

$payload = Join-Path $cache "payload.zip"
if (Test-Path $payload) {
  Remove-Item -LiteralPath $payload -Force
}
$go = Join-Path $goExtract "go\bin\go.exe"
Invoke-Checked $go @("run", (Join-Path $repo "apps\portable\packager\main.go"), $stage, $payload)
$base = Join-Path $cache "DocSys-Server-base.exe"
$final = Join-Path $output "DocSys Server.exe"
$env:CGO_ENABLED = "0"
Invoke-Checked $go @("build", "-trimpath", "-ldflags", "-s -w -H=windowsgui", "-o", $base, ".") (Join-Path $repo "apps\portable\launcher")
Copy-Item -Force $base $final
$destination = [System.IO.File]::Open($final, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write)
$source = [System.IO.File]::OpenRead($payload)
try {
  $source.CopyTo($destination)
} finally {
  $source.Dispose()
  $destination.Dispose()
}

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $final).Hash
Set-Content -LiteralPath ($final + ".sha256") -Value "$hash  $([System.IO.Path]::GetFileName($final))" -Encoding ASCII
Write-Host "Created $final"
Write-Host "SHA256 $hash"
