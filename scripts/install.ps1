[CmdletBinding()]
param(
  [switch]$SkipNpmInstall
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ManifestPath = Join-Path $RepoRoot 'package.json'
$CommandNames = @('codexm', 'codexmm', 'codexmc', 'codexmh', 'codexmctl')

function Invoke-Npm {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & npm.cmd @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "npm $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Test-OwnedCodexMonitorShim {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  try {
    $text = Get-Content -LiteralPath $Path -Raw -ErrorAction Stop
  } catch {
    return $false
  }
  return $text -match 'node_modules[\\/](codex-monitor|codex-monitor-wrapper)[\\/]'
}

if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
  throw "package.json was not found at $ManifestPath"
}

$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if ($manifest.name -ne 'codex-monitor') {
  throw "Refusing to install: package name is '$($manifest.name)', expected 'codex-monitor'."
}

Push-Location $RepoRoot
try {
  Write-Host 'Codex Monitor installer'
  Write-Host "Source: $RepoRoot"

  $nodeVersion = (& node.exe -p "process.versions.node").Trim()
  if ($LASTEXITCODE -ne 0 -or -not $nodeVersion) {
    throw 'Node.js was not found on PATH.'
  }

  & node.exe -e "const [a,b]=process.versions.node.split('.').map(Number); if (a < 22 || (a === 22 && b < 13) || a >= 27) process.exit(1)"
  if ($LASTEXITCODE -ne 0) {
    throw "Unsupported Node.js $nodeVersion. Codex Monitor requires Node >=22.13 and <27."
  }
  Write-Host "Node: v$nodeVersion"

  if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
    Write-Warning 'Official codex CLI was not found on PATH. Installation can continue, but Live mode will not work until Codex is installed.'
  }

  if (-not $SkipNpmInstall) {
    Write-Host 'Installing repository dependencies...'
    Invoke-Npm install
  }

  & npm.cmd uninstall -g codex-monitor *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Warning 'npm could not remove an existing codex-monitor global registration; checking shims before continuing.'
  }

  $globalPrefix = (& npm.cmd prefix -g).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $globalPrefix) {
    throw 'Could not determine the npm global prefix.'
  }

  foreach ($name in $CommandNames) {
    foreach ($suffix in @('', '.cmd', '.ps1')) {
      $shim = Join-Path $globalPrefix "$name$suffix"
      if (-not (Test-Path -LiteralPath $shim -PathType Leaf)) { continue }
      if (-not (Test-OwnedCodexMonitorShim -Path $shim)) {
        throw "Refusing to overwrite existing command not recognized as Codex Monitor-owned: $shim"
      }
      Write-Host "Removing stale Codex Monitor shim: $shim"
      Remove-Item -LiteralPath $shim -Force
    }
  }

  Write-Host 'Linking codex-monitor globally...'
  Invoke-Npm link

  foreach ($name in $CommandNames) {
    $command = Get-Command $name -ErrorAction Stop
    Write-Host "$name: $($command.Source)"
  }

  & codexmctl version
  if ($LASTEXITCODE -ne 0) {
    throw 'Codex Monitor CLI family was linked but the Monitor version smoke test failed.'
  }

  Write-Host ''
  Write-Host 'Codex Monitor installation complete.'
  Write-Host 'Run: codexmctl doctor'
  Write-Host 'Help: codexmh'
  Write-Host 'Then: codexm'
} finally {
  Pop-Location
}
