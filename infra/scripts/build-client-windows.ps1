param(
  [string]$OutputDirectory = "dist-portable"
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$cache = Join-Path $repo ".build-cache\client"
$portableCache = Join-Path $repo ".build-cache\portable"
$downloads = Join-Path $portableCache "downloads"
$output = Join-Path $repo $OutputDirectory
$goArchive = Join-Path $downloads "go1.26.5.windows-amd64.zip"
$goExtract = Join-Path $portableCache "go-extract"
$payload = Join-Path $cache "web.zip"

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

New-Item -ItemType Directory -Force -Path $cache, $downloads, $output | Out-Null
Invoke-Checked "corepack" @("pnpm@9.15.9", "install", "--frozen-lockfile")
$env:VITE_API_URL = "http://127.0.0.1:3001"
$env:VITE_COLLAB_URL = "ws://127.0.0.1:3002"
Invoke-Checked "corepack" @("pnpm@9.15.9", "--filter", "@docsys/web", "build")

if (-not (Test-Path $goArchive)) {
  Invoke-WebRequest -Uri "https://go.dev/dl/go1.26.5.windows-amd64.zip" -OutFile $goArchive -UseBasicParsing
}
$goHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $goArchive).Hash.ToLowerInvariant()
if ($goHash -ne "97e6b2a833b6d89f9ff17d25419ac0a7e3b482a044e9ab18cdef834bd834fd38") {
  throw "Go checksum mismatch"
}
if (-not (Test-Path (Join-Path $goExtract "go\bin\go.exe"))) {
  New-Item -ItemType Directory -Force -Path $goExtract | Out-Null
  Invoke-Checked "tar.exe" @("-xf", $goArchive, "-C", $goExtract)
}
if (Test-Path $payload) {
  Remove-Item -LiteralPath $payload -Force
}
$go = Join-Path $goExtract "go\bin\go.exe"
Invoke-Checked $go @("run", (Join-Path $repo "apps\portable\packager\main.go"), (Join-Path $repo "apps\web\dist"), $payload)
$base = Join-Path $cache "DocSys-base.exe"
$final = Join-Path $output "DocSys.exe"
$env:CGO_ENABLED = "0"
Invoke-Checked $go @("build", "-trimpath", "-ldflags", "-s -w -H=windowsgui", "-o", $base, ".") (Join-Path $repo "apps\portable\client")
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
