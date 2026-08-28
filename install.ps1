[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Repository = 'l0N9X69N/Codex-Monitor'
$Ref = 'v1-finalization'
$InstallRoot = Join-Path $env:LOCALAPPDATA 'CodexMonitor\app'
$ProductRoot = Split-Path -Parent $InstallRoot
$FreshInstall = -not (Test-Path -LiteralPath $InstallRoot)
$CommandNames = @('codexm', 'codexmm', 'codexmc', 'codexmh', 'codexmctl')
$InstalledSharedNode = $false

function Refresh-ProcessPath {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = @($machine, $user) -join ';'
}

function Test-SupportedNodeVersion {
  param([string]$Version)
  if (-not $Version) { return $false }
  $parts = $Version.Split('.')
  if ($parts.Count -lt 2) { return $false }
  $major = 0
  $minor = 0
  if (-not [int]::TryParse($parts[0], [ref]$major)) { return $false }
  if (-not [int]::TryParse($parts[1], [ref]$minor)) { return $false }
  return (($major -gt 22 -or ($major -eq 22 -and $minor -ge 13)) -and $major -lt 27)
}

function Get-NodeRuntimeState {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  $version = $null
  if ($node) {
    try { $version = (& node.exe -p "process.versions.node").Trim() } catch { $version = $null }
  }
  return [PSCustomObject]@{
    Node = $node
    Npm = $npm
    Version = $version
    Supported = (Test-SupportedNodeVersion -Version $version)
  }
}

function Install-NodeAndNpmWhenAbsent {
  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw 'Node.js/npm are not installed. Automatic setup requires winget. Install Node.js >=22.13 and <27 manually, then run this command again.'
  }

  Write-Host 'Node.js/npm are not installed. Installing the current Node.js LTS package with bundled npm...'
  & winget.exe install --id OpenJS.NodeJS.LTS -e --source winget --accept-source-agreements --accept-package-agreements --silent
  if ($LASTEXITCODE -ne 0) {
    throw "winget failed to install Node.js LTS (exit code $LASTEXITCODE)."
  }

  Refresh-ProcessPath
  $state = Get-NodeRuntimeState
  if (-not $state.Node -or -not $state.Npm -or -not $state.Supported) {
    throw 'Node.js installation completed but a supported Node/npm runtime is not available in this PowerShell session. Open a new PowerShell window and run the installer again.'
  }
  $script:InstalledSharedNode = $true
}

function Assert-SafeSharedRuntime {
  $state = Get-NodeRuntimeState
  if (-not $state.Node -and -not $state.Npm) {
    Install-NodeAndNpmWhenAbsent
    return Get-NodeRuntimeState
  }

  if (-not $state.Node) {
    throw 'npm is present but Node.js is not resolvable. Codex Monitor will not modify this shared runtime automatically; repair/install Node.js manually first.'
  }
  if (-not $state.Supported) {
    throw "Existing shared Node.js v$($state.Version) is outside Codex Monitor's supported range (>=22.13 and <27). The installer will not upgrade or replace an existing Node.js installation automatically. Update it yourself, then rerun the installer."
  }
  if (-not $state.Npm) {
    throw 'A supported Node.js installation exists but npm is missing. The installer will not replace or modify an existing shared Node.js installation automatically. Repair npm/Node manually, then rerun the installer.'
  }
  return $state
}

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

function Invoke-Npm {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & npm.cmd @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "npm $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Install-LocalSource {
  param(
    [string]$Root,
    [switch]$SkipDependencyInstall
  )

  if (-not (Test-CodexMonitorSource -Path $Root)) {
    throw "Refusing to install unrecognized source: $Root"
  }

  Push-Location $Root
  try {
    if (-not $SkipDependencyInstall) {
      Write-Host 'Installing Codex Monitor dependencies from package-lock.json...'
      Invoke-Npm ci
    }

    # Remove only this product's previous global npm registration/link. This
    # never uninstalls Node, npm, Codex, or unrelated global npm packages.
    & npm.cmd uninstall -g codex-monitor *> $null
    if ($LASTEXITCODE -ne 0) {
      Write-Warning 'npm could not remove an existing codex-monitor global registration; checking Monitor-owned shims before continuing.'
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

    Write-Host 'Linking Codex Monitor command family globally...'
    Invoke-Npm link

    foreach ($name in $CommandNames) {
      $command = Get-Command $name -ErrorAction Stop
      Write-Host "${name}: $($command.Source)"
    }

    & codexmctl version
    if ($LASTEXITCODE -ne 0) {
      throw 'Codex Monitor CLI family was linked but the Monitor version smoke test failed.'
    }
  } finally {
    Pop-Location
  }
}

function Enable-FirstRunOnboarding {
  param([string]$Root)

  Push-Location $Root
  try {
    $result = & node.exe --input-type=module -e "import { prepareFreshInstallOnboarding } from './src/config/first-run.js'; const result = prepareFreshInstallOnboarding(); process.stdout.write(JSON.stringify({ changed: result.changed, reason: result.reason }));"
    if ($LASTEXITCODE -ne 0) {
      throw 'Could not prepare first-run onboarding.'
    }
    $status = $result | ConvertFrom-Json
    if ($status.changed) {
      Write-Host 'First-run setup armed while preserving existing Monitor preferences.'
    } else {
      Write-Host "First-run setup state: $($status.reason)"
    }
  } finally {
    Pop-Location
  }
}

Write-Host 'Codex Monitor GitHub installer'
Write-Host "Repository: https://github.com/$Repository"
Write-Host "Ref: $Ref"
Write-Host "Install path: $InstallRoot"
Write-Host ''

Refresh-ProcessPath
$runtime = Assert-SafeSharedRuntime
Write-Host "Node: v$($runtime.Version)"
Write-Host "npm:  v$((& npm.cmd --version).Trim())"
if ($InstalledSharedNode) {
  Write-Host 'Node/npm were installed because neither runtime was previously present. Uninstall will leave them installed because they are shared system tools.'
} else {
  Write-Host 'Existing Node/npm detected; installer will not upgrade, replace, or remove them.'
}

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
  Write-Warning 'Official Codex CLI was not found on PATH. Installation can continue, but Live mode will not work until Codex is installed. Codex Monitor does not install or modify Codex.'
}

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("codex-monitor-install-" + [Guid]::NewGuid().ToString('N'))
$zipPath = Join-Path $tempRoot 'source.zip'
$extractRoot = Join-Path $tempRoot 'source'
$backupRoot = $null

New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
New-Item -ItemType Directory -Path $extractRoot -Force | Out-Null

try {
  $zipUrl = "https://api.github.com/repos/$Repository/zipball/$Ref"
  Write-Host 'Downloading the latest Codex Monitor source from the configured GitHub ref...'
  Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -Headers @{ 'User-Agent' = 'Codex-Monitor-Installer' }

  Write-Host 'Extracting source...'
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractRoot -Force
  $sourceRoot = (Get-ChildItem -LiteralPath $extractRoot -Directory | Select-Object -First 1).FullName
  if (-not $sourceRoot -or -not (Test-CodexMonitorSource -Path $sourceRoot)) {
    throw 'Downloaded GitHub archive is not a recognized Codex Monitor source tree.'
  }

  New-Item -ItemType Directory -Path $ProductRoot -Force | Out-Null

  if (Test-Path -LiteralPath $InstallRoot) {
    if (-not (Test-CodexMonitorSource -Path $InstallRoot)) {
      throw "Refusing to replace unrecognized existing directory: $InstallRoot"
    }
    $backupRoot = "$InstallRoot.backup-$([Guid]::NewGuid().ToString('N'))"
    Write-Host "Backing up existing installation: $backupRoot"
    Move-Item -LiteralPath $InstallRoot -Destination $backupRoot
  }

  Move-Item -LiteralPath $sourceRoot -Destination $InstallRoot

  try {
    Install-LocalSource -Root $InstallRoot
    if ($FreshInstall) {
      Enable-FirstRunOnboarding -Root $InstallRoot
    }
  } catch {
    Write-Warning 'Installation failed; restoring the previous source installation if one existed.'
    if (Test-Path -LiteralPath $InstallRoot) {
      Remove-Item -LiteralPath $InstallRoot -Recurse -Force
    }
    if ($backupRoot -and (Test-Path -LiteralPath $backupRoot)) {
      Move-Item -LiteralPath $backupRoot -Destination $InstallRoot
      $backupRoot = $null
      try {
        Install-LocalSource -Root $InstallRoot -SkipDependencyInstall
      } catch {
        Write-Warning 'Previous source was restored, but its global link could not be restored automatically.'
      }
    }
    throw
  }

  if ($backupRoot -and (Test-Path -LiteralPath $backupRoot)) {
    Remove-Item -LiteralPath $backupRoot -Recurse -Force
    $backupRoot = $null
  }

  Write-Host ''
  Write-Host 'GitHub installation complete.'
  Write-Host "Installed source: $InstallRoot"
  Write-Host 'Run: codexmctl doctor'
  Write-Host 'Help: codexmh'
  if ($FreshInstall) {
    Write-Host 'Then run: codexm  (first bare launch opens Initial Setup before Codex)'
  } else {
    Write-Host 'Then run: codexm'
  }
} finally {
  if ($backupRoot -and (Test-Path -LiteralPath $backupRoot) -and -not (Test-Path -LiteralPath $InstallRoot)) {
    Move-Item -LiteralPath $backupRoot -Destination $InstallRoot
  }
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
