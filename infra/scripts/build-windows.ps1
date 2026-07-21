param(
  [string]$OutputDirectory = "dist-portable"
)

$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "build-server-windows.ps1") -OutputDirectory $OutputDirectory
& (Join-Path $PSScriptRoot "build-client-windows.ps1") -OutputDirectory $OutputDirectory
