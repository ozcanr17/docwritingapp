param(
  [string]$OutputDirectory = "dist-portable"
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$output = Join-Path $repo $OutputDirectory
$manifest = Get-Content -Raw -LiteralPath (Join-Path $repo "release.json") | ConvertFrom-Json
$client = Join-Path $output "DocSys.exe"
$server = Join-Path $output "DocSys Server.exe"
$clientHash = $client + ".sha256"
$serverHash = $server + ".sha256"

foreach ($path in @($client, $server, $clientHash, $serverHash)) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Missing Windows release artifact: $path"
  }
}

$archive = Join-Path $output "DocSys-Windows-Portable-v$($manifest.version).zip"
if (Test-Path -LiteralPath $archive) {
  Remove-Item -LiteralPath $archive -Force
}

Compress-Archive -LiteralPath $client, $server, $clientHash, $serverHash -DestinationPath $archive -CompressionLevel Optimal
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash
Set-Content -LiteralPath ($archive + ".sha256") -Value "$hash  $([System.IO.Path]::GetFileName($archive))" -Encoding ASCII
Write-Host "Created $archive"
Write-Host "SHA256 $hash"
