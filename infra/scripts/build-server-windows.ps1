param(
  [string]$OutputDirectory = "dist-portable"
)

$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "build-portable-windows.ps1") -OutputDirectory $OutputDirectory
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
