[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$InstallRoot = Join-Path $env:LOCALAPPDATA 'CodexMonitor\app'

function Test-CodexMonitorSource {
  param([string]$Path)
  $manifestPath = Join-Path $Path 'package.json'
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { return $false }
  try {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    return $manifest.name -eq 'codex-monitor'
  } catch {
    return $false
  }
}

function Test-OwnedCodexmShim {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  try {
    $text = Get-Content -LiteralPath $Path -Raw -ErrorAction Stop
  } catch {
    return $false
  }
  return $text -match 'node_modules[\\/](codex-monitor|codex-monitor-wrapper)[\\/]'
}

Write-Host 'Codex Monitor GitHub uninstaller'
Write-Host 'Preserving Monitor config, Archive SQLite, official Codex auth and official Codex sessions.'
Write-Host ''

$localUninstaller = Join-Path $InstallRoot 'scripts\uninstall.ps1'
if (Test-Path -LiteralPath $localUninstaller -PathType Leaf) {
  if (-not (Test-CodexMonitorSource -Path $InstallRoot)) {
    throw "Refusing to execute an unrecognized installation at $InstallRoot"
  }

  Write-Host "Installed source: $InstallRoot"
  Write-Host 'Running the installed ownership-aware uninstaller...'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $localUninstaller
  if ($LASTEXITCODE -ne 0) {
    throw "Installed Codex Monitor uninstaller failed with exit code $LASTEXITCODE."
  }

  Write-Host ''
  Write-Host 'GitHub uninstall complete.'
  Write-Host 'A later GitHub install is treated as a fresh install and will open Initial Setup on first codexm launch.'
  return
}

Write-Warning "Installed GitHub source was not found at $InstallRoot. Falling back to package/link cleanup only."

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npm) {
  Write-Host 'Removing global codex-monitor package/link...'
  & npm.cmd uninstall -g codex-monitor
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "npm uninstall -g codex-monitor returned exit code $LASTEXITCODE."
  }

  $globalPrefix = (& npm.cmd prefix -g).Trim()
  if ($LASTEXITCODE -eq 0 -and $globalPrefix) {
    foreach ($shim in @(
      (Join-Path $globalPrefix 'codexm'),
      (Join-Path $globalPrefix 'codexm.cmd'),
      (Join-Path $globalPrefix 'codexm.ps1')
    )) {
      if ((Test-Path -LiteralPath $shim -PathType Leaf) -and (Test-OwnedCodexmShim -Path $shim)) {
        Write-Host "Removing stale Codex Monitor shim: $shim"
        Remove-Item -LiteralPath $shim -Force
      }
    }
  }
} else {
  Write-Warning 'npm was not found on PATH; package/link cleanup could not be performed.'
}

if (Test-Path -LiteralPath $InstallRoot) {
  if (Test-CodexMonitorSource -Path $InstallRoot) {
    Write-Host "Removing recognized GitHub install source: $InstallRoot"
    Remove-Item -LiteralPath $InstallRoot -Recurse -Force
  } else {
    Write-Warning "Leaving unrecognized directory untouched: $InstallRoot"
  }
}

Write-Host ''
Write-Host 'Fallback uninstall complete.'
Write-Host 'Monitor config, Archive SQLite, official Codex auth and official Codex sessions were not deleted.'
Write-Host 'If Archive integration is still active, reinstall Codex Monitor and run codexm --uninstall once so the installed cleanup module can remove only Monitor-owned hooks/service state.'
