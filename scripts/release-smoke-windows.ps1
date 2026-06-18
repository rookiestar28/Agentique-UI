param(
  [Parameter(Mandatory = $true)][string]$Artifact,
  [Parameter(Mandatory = $true)][string]$ExpectedVersion,
  [string]$UpdaterManifest = "",
  [switch]$AllowUnsignedLocalSmoke
)

$ErrorActionPreference = "Stop"

function Write-RedactedLog {
  param([string]$Message)
  $safe = $Message -replace [regex]::Escape($PWD.Path), "<workspace>"
  Write-Output $safe
}

if (-not (Test-Path -LiteralPath $Artifact)) {
  throw "Missing installer artifact."
}

$signature = Get-AuthenticodeSignature -LiteralPath $Artifact
if ($signature.Status -ne "Valid" -and -not $AllowUnsignedLocalSmoke) {
  throw "Installer signature is not valid. Use unsigned local smoke only for non-public checks."
}

if ($UpdaterManifest -and -not (Test-Path -LiteralPath $UpdaterManifest)) {
  throw "Updater manifest was requested but is missing."
}

$smokeRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("agentique-ui-smoke-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $smokeRoot | Out-Null

try {
  Write-RedactedLog "install check pending for artifact"
  Write-RedactedLog "launch check pending for version $ExpectedVersion"
  Write-RedactedLog "update check requires signed manifest when provided"
  Write-RedactedLog "uninstall and cleanup checks must remove smoke state"
} finally {
  if (Test-Path -LiteralPath $smokeRoot) {
    Remove-Item -LiteralPath $smokeRoot -Recurse -Force
  }
}
