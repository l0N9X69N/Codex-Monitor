[CmdletBinding()]
param(
  [switch]$IntegrationAlreadyClean,
  [int]$ParentPid = 0
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BootstrapInstallRoot = Join-Path $env:LOCALAPPDATA 'CodexMonitor\app'

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

function Test-SamePath {
  param([string]$A, [string]$B)
  try {
    return [IO.Path]::GetFullPath($A).TrimEnd('\\') -ieq [IO.Path]::GetFullPath($B).TrimEnd('\\')
  } catch {
    return $false
  }
}

function Wait-ForParentExit {
  param([int]$ProcessId)
  if ($ProcessId -le 0) { return }
  $deadline = [DateTime]::UtcNow.AddSeconds(15)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { return }
    Start-Sleep -Milliseconds 100
  }
  throw "Timed out waiting for codexm process $ProcessId to exit."
}

Write-Host 'Codex Monitor uninstaller'
Write-Host 'Preserving Monitor config, Archive SQLite, official Codex auth and official Codex sessions.'

if (-not $IntegrationAlreadyClean) {
  $cleanupScript = Join-Path $RepoRoot 'scripts\uninstall-integration.mjs'
  if (-not (Test-Path -LiteralPath $cleanupScript -PathType Leaf)) {
    throw "Integration cleanup entrypoint was not found: $cleanupScript"
  }
  Write-Host 'Removing Monitor-owned Archive hook/service integration...'
  & node.exe $cleanupScript
  if ($LASTEXITCODE -ne 0) {
    throw "Archive integration cleanup failed with exit code $LASTEXITCODE. Package removal was stopped."
  }
}

Wait-ForParentExit -ProcessId $ParentPid

Write-Host 'Removing global codex-monitor package/link...'
& npm.cmd uninstall -g codex-monitor
if ($LASTEXITCODE -ne 0) {
  Write-Warning "npm uninstall -g codex-monitor returned exit code $LASTEXITCODE; checking for stale owned shims."
}

$globalPrefix = (& npm.cmd prefix -g).Trim()
if ($LASTEXITCODE -ne 0 -or -not $globalPrefix) {
  throw 'Could not determine the npm global prefix.'
}

$shimPaths = @(
  (Join-Path $globalPrefix 'codexm'),
  (Join-Path $globalPrefix 'codexm.cmd'),
  (Join-Path $globalPrefix 'codexm.ps1')
)

foreach ($shim in $shimPaths) {
  if (-not (Test-Path -LiteralPath $shim -PathType Leaf)) { continue }
  if (-not (Test-OwnedCodexmShim -Path $shim)) {
    Write-Warning "Leaving existing command because it is not recognized as Codex Monitor-owned: $shim"
    continue
  }
  Write-Host "Removing stale Codex Monitor shim: $shim"
  Remove-Item -LiteralPath $shim -Force
}

if (Test-SamePath -A $RepoRoot -B $BootstrapInstallRoot) {
  Write-Host "Removing GitHub bootstrap source: $RepoRoot"
  Set-Location $env:TEMP
  Remove-Item -LiteralPath $RepoRoot -Recurse -Force -ErrorAction Stop
}

Write-Host ''
Write-Host 'Codex Monitor uninstall complete.'
Write-Host 'Preserved: Monitor config, Archive SQLite, official Codex auth, official Codex sessions.'
