[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Repository = 'l0N9X69N/Codex-Monitor'
$Ref = 'v1-rearchitecture'
$InstallRoot = Join-Path $env:LOCALAPPDATA 'CodexMonitor\app'
$ProductRoot = Split-Path -Parent $InstallRoot

function Refresh-ProcessPath {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = @($machine, $user) -join ';'
}

function Test-CompatibleNode {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $node -or -not $npm) { return $false }

  & node.exe -e "const [a,b]=process.versions.node.split('.').map(Number); if (a < 22 || (a === 22 && b < 13) || a >= 27) process.exit(1)"
  return $LASTEXITCODE -eq 0
}

function Install-NodeAndNpm {
  Write-Host 'Node.js/npm are missing or outside the supported range.'
  Write-Host 'Installing Node.js LTS with npm...'

  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw 'Automatic Node/npm installation requires winget. Install Node.js >=22.13 and <27 manually, then run this command again.'
  }

  & winget.exe install --id OpenJS.NodeJS.LTS -e --source winget --accept-source-agreements --accept-package-agreements --silent
  if ($LASTEXITCODE -ne 0) {
    throw "winget failed to install Node.js LTS (exit code $LASTEXITCODE)."
  }

  Refresh-ProcessPath
  if (-not (Test-CompatibleNode)) {
    throw 'Node.js/npm installation completed but this PowerShell session still cannot resolve a supported Node runtime. Open a new PowerShell window and run the installer again.'
  }
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

function Invoke-LocalInstaller {
  param(
    [string]$Root,
    [switch]$SkipNpmInstall
  )

  $scriptPath = Join-Path $Root 'scripts\install.ps1'
  if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    throw "Downloaded source is missing $scriptPath"
  }

  $args = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $scriptPath)
  if ($SkipNpmInstall) { $args += '-SkipNpmInstall' }
  & powershell.exe @args
  if ($LASTEXITCODE -ne 0) {
    throw "Codex Monitor local installer failed with exit code $LASTEXITCODE."
  }
}

Write-Host 'Codex Monitor GitHub installer'
Write-Host "Repository: https://github.com/$Repository"
Write-Host "Ref: $Ref"
Write-Host "Install path: $InstallRoot"
Write-Host ''

Refresh-ProcessPath
if (-not (Test-CompatibleNode)) {
  Install-NodeAndNpm
}

$nodeVersion = (& node.exe -p "process.versions.node").Trim()
$npmVersion = (& npm.cmd --version).Trim()
Write-Host "Node: v$nodeVersion"
Write-Host "npm:  v$npmVersion"

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("codex-monitor-install-" + [Guid]::NewGuid().ToString('N'))
$zipPath = Join-Path $tempRoot 'source.zip'
$extractRoot = Join-Path $tempRoot 'source'
$backupRoot = $null

New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
New-Item -ItemType Directory -Path $extractRoot -Force | Out-Null

try {
  $zipUrl = "https://api.github.com/repos/$Repository/zipball/$Ref"
  Write-Host 'Downloading Codex Monitor from GitHub...'
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
    Invoke-LocalInstaller -Root $InstallRoot
  } catch {
    Write-Warning 'Installation failed; restoring the previous source installation if one existed.'
    if (Test-Path -LiteralPath $InstallRoot) {
      Remove-Item -LiteralPath $InstallRoot -Recurse -Force
    }
    if ($backupRoot -and (Test-Path -LiteralPath $backupRoot)) {
      Move-Item -LiteralPath $backupRoot -Destination $InstallRoot
      $backupRoot = $null
      try {
        Invoke-LocalInstaller -Root $InstallRoot -SkipNpmInstall
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
  Write-Host 'Run: codexm --doctor'
  Write-Host 'Then: codexm'
} finally {
  if ($backupRoot -and (Test-Path -LiteralPath $backupRoot) -and -not (Test-Path -LiteralPath $InstallRoot)) {
    Move-Item -LiteralPath $backupRoot -Destination $InstallRoot
  }
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
