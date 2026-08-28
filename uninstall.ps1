[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$InstallRoot = Join-Path $env:LOCALAPPDATA 'CodexMonitor\app'
$CommandNames = @('codexm', 'codexmm', 'codexmc', 'codexmh', 'codexmctl')

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

function Invoke-IntegrationCleanup {
  param([string]$Root)
  $cleanupScript = Join-Path $Root 'scripts\uninstall-integration.mjs'
  if (-not (Test-Path -LiteralPath $cleanupScript -PathType Leaf)) {
    Write-Warning 'Installed integration-cleanup module was not found. Continuing with package/source cleanup only.'
    return
  }
  Write-Host 'Removing Monitor-owned Archive hook/service integration...'
  & node.exe $cleanupScript
  if ($LASTEXITCODE -ne 0) {
    throw "Archive integration cleanup failed with exit code $LASTEXITCODE. Package/source removal was stopped to avoid leaving a half-removed installation."
  }
}

Write-Host 'Codex Monitor GitHub uninstaller'
Write-Host 'This removes Codex Monitor-owned integration, package/link, command shims and installed source only.'
Write-Host 'It preserves Node.js, npm, official Codex, Codex auth/sessions, Monitor config and Archive SQLite.'
Write-Host ''

if (Test-Path -LiteralPath $InstallRoot) {
  if (-not (Test-CodexMonitorSource -Path $InstallRoot)) {
    throw "Refusing to modify unrecognized directory: $InstallRoot"
  }

  if (Get-Command node.exe -ErrorAction SilentlyContinue) {
    Invoke-IntegrationCleanup -Root $InstallRoot
  } else {
    Write-Warning 'Node.js was not found, so Monitor-owned Archive integration could not be cleaned through the installed module. Source/package cleanup will continue; review Codex /hooks if a stale Monitor hook remains.'
  }
} else {
  Write-Warning "Recognized GitHub install source was not found at $InstallRoot. Continuing with ownership-checked npm/shim cleanup."
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npm) {
  Write-Host 'Removing only the global codex-monitor package/link...'
  & npm.cmd uninstall -g codex-monitor
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "npm uninstall -g codex-monitor returned exit code $LASTEXITCODE; checking owned shims directly."
  }

  $globalPrefix = (& npm.cmd prefix -g).Trim()
  if ($LASTEXITCODE -eq 0 -and $globalPrefix) {
    foreach ($name in $CommandNames) {
      foreach ($suffix in @('', '.cmd', '.ps1')) {
        $shim = Join-Path $globalPrefix "$name$suffix"
        if (-not (Test-Path -LiteralPath $shim -PathType Leaf)) { continue }
        if (-not (Test-OwnedCodexMonitorShim -Path $shim)) {
          Write-Warning "Leaving command untouched because it is not recognized as Codex Monitor-owned: $shim"
          continue
        }
        Write-Host "Removing stale Codex Monitor shim: $shim"
        Remove-Item -LiteralPath $shim -Force
      }
    }
  }
} else {
  Write-Warning 'npm was not found on PATH. It will not be installed or removed by the uninstaller. Any Monitor-owned npm link must be cleaned manually if still present.'
}

if (Test-Path -LiteralPath $InstallRoot) {
  if (Test-CodexMonitorSource -Path $InstallRoot) {
    Write-Host "Removing recognized Codex Monitor source: $InstallRoot"
    Set-Location $env:TEMP
    Remove-Item -LiteralPath $InstallRoot -Recurse -Force
  } else {
    Write-Warning "Leaving unrecognized directory untouched: $InstallRoot"
  }
}

Write-Host ''
Write-Host 'Codex Monitor uninstall complete.'
Write-Host 'Preserved shared/system tools: Node.js, npm, official Codex.'
Write-Host 'Preserved user data: Codex auth, Codex sessions, Monitor config, Local Session Archive SQLite.'
