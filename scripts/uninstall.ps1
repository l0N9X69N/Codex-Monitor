[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

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

Write-Host 'Codex Monitor uninstaller'
Write-Host 'This keeps Monitor config, Archive SQLite, official Codex auth and official Codex sessions.'

$codexm = Get-Command codexm -ErrorAction SilentlyContinue
if ($codexm) {
  Write-Host 'Removing Monitor-owned Archive hook/service integration...'
  & codexm --uninstall
  if ($LASTEXITCODE -ne 0) {
    throw "codexm --uninstall failed with exit code $LASTEXITCODE. Package removal was stopped."
  }
} else {
  Write-Warning 'codexm command was not found; skipping built-in integration cleanup.'
}

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

Write-Host ''
Write-Host 'Codex Monitor package/link removal complete.'
Write-Host 'Preserved: Monitor config, Archive SQLite, official Codex auth, official Codex sessions.'
