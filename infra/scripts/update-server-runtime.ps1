param(
  [switch]$Dependencies
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$docsysRoot = Join-Path $env:LOCALAPPDATA "DocSys"
$runtime = Join-Path $docsysRoot "runtime\0.1.5-server.1"
$app = Join-Path $runtime "app"
$next = Join-Path $runtime "app.next"
$previous = Join-Path $runtime "app.previous"

function Replace-Directory([string]$Source, [string]$Destination) {
  $nextDirectory = $Destination + ".next"
  $previousDirectory = $Destination + ".previous"
  if (Test-Path $nextDirectory) {
    Remove-Item -LiteralPath $nextDirectory -Recurse -Force
  }
  if (Test-Path $previousDirectory) {
    Remove-Item -LiteralPath $previousDirectory -Recurse -Force
  }
  Copy-Item -Recurse -Force -LiteralPath $Source -Destination $nextDirectory
  if (Test-Path $Destination) {
    Move-Item -LiteralPath $Destination -Destination $previousDirectory
  }
  Move-Item -LiteralPath $nextDirectory -Destination $Destination
  if (Test-Path $previousDirectory) {
    Remove-Item -LiteralPath $previousDirectory -Recurse -Force
  }
}

if (-not (Test-Path (Join-Path $runtime ".ready"))) {
  throw "Run DocSys Server.exe once before using the fast backend update"
}
$resolvedDocsysRoot = [System.IO.Path]::GetFullPath($docsysRoot).TrimEnd('\') + '\'
$resolvedRuntime = [System.IO.Path]::GetFullPath($runtime).TrimEnd('\') + '\'
if (-not $resolvedRuntime.StartsWith($resolvedDocsysRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Runtime path is outside the DocSys user directory"
}
try {
  $status = Invoke-WebRequest -Uri "http://127.0.0.1:45174/api/status" -UseBasicParsing -TimeoutSec 1
  if ($status.StatusCode -eq 200) {
    throw "Stop DocSys Server from the server panel before updating the backend"
  }
} catch {
  if ($_.Exception.Message -like "Stop DocSys Server*") {
    throw
  }
}

$env:DATABASE_URL = "postgresql://docsys:docsys@127.0.0.1:45432/docsys"
& corepack pnpm@9.15.9 --filter @docsys/database generate
foreach ($package in @("@docsys/database", "@docsys/config", "@docsys/api", "@docsys/collaboration", "@docsys/worker")) {
  & corepack pnpm@9.15.9 --filter $package build
  if ($LASTEXITCODE -ne 0) {
    throw "Build failed for $package"
  }
}
$generatedPrismaClient = Get-ChildItem (Join-Path $repo "node_modules\.pnpm") -Directory -Filter "@prisma+client@*" |
  ForEach-Object { Join-Path $_.FullName "node_modules\.prisma\client" } |
  Where-Object { Test-Path (Join-Path $_ "query_engine-windows.dll.node") } |
  Select-Object -First 1
if (-not $Dependencies) {
  $distSources = @{
    "api" = Join-Path $repo "apps\api\dist"
    "collaboration" = Join-Path $repo "apps\collaboration\dist"
    "worker" = Join-Path $repo "apps\worker\dist"
    "database" = Join-Path $repo "packages\database\dist"
    "config" = Join-Path $repo "packages\config\dist"
  }
  foreach ($name in $distSources.Keys) {
    $target = Join-Path $app "node_modules\@docsys\$name\dist"
    Replace-Directory $distSources[$name] $target
  }
  New-Item -ItemType Directory -Force -Path (Join-Path $app "node_modules\.prisma") | Out-Null
  Replace-Directory $generatedPrismaClient (Join-Path $app "node_modules\.prisma\client")
  Copy-Item -Force (Join-Path $repo "packages\database\prisma\schema.prisma") (Join-Path $runtime "database\schema.prisma")
  Copy-Item -Recurse -Force (Join-Path $repo "packages\database\prisma\migrations\*") (Join-Path $runtime "database\migrations")
  Copy-Item -Force (Join-Path $repo "infra\scripts\seed-admin.mjs") (Join-Path $app "seed-admin.mjs")
  Write-Host "Backend code updated without rebuilding dependencies, infrastructure, or EXE files"
  return
}
if (Test-Path $next) {
  Remove-Item -LiteralPath $next -Recurse -Force
}
& corepack pnpm@9.15.9 --config.node-linker=hoisted --config.package-import-method=copy --filter @docsys/portable deploy --prod $next
if ($LASTEXITCODE -ne 0) {
  throw "Portable backend deployment failed"
}
New-Item -ItemType Directory -Force -Path (Join-Path $next "node_modules\.prisma") | Out-Null
Copy-Item -Recurse -Force $generatedPrismaClient (Join-Path $next "node_modules\.prisma\client")
Copy-Item -Force (Join-Path $repo "infra\scripts\seed-admin.mjs") (Join-Path $next "seed-admin.mjs")
if (Test-Path $previous) {
  Remove-Item -LiteralPath $previous -Recurse -Force
}
Move-Item -LiteralPath $app -Destination $previous
Move-Item -LiteralPath $next -Destination $app
Remove-Item -LiteralPath $previous -Recurse -Force
Write-Host "Backend runtime updated without rebuilding infrastructure or EXE files"
