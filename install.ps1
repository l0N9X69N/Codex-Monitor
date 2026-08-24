$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host 'Codex Monitor v1.0.0 - installer' -ForegroundColor Cyan
Write-Host 'No Rust build and no Codex patching.' -ForegroundColor DarkGray
Write-Host ''

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js was not found. Install Node.js 20-26 first.' }
$major = [int]((& node -p "process.versions.node.split('.')[0]").Trim())
if ($major -lt 20 -or $major -ge 27) { throw "Node.js $major is unsupported. Use Node.js 20-26." }

$codex = Get-Command codex -ErrorAction SilentlyContinue
if (-not $codex) { throw 'Official Codex CLI was not found on PATH. Install/update @openai/codex first.' }

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
if (-not $npm) { throw 'npm was not found.' }

Write-Host "Node:  $((& node --version).Trim())" -ForegroundColor DarkGray
Write-Host "Codex: $($codex.Source)" -ForegroundColor DarkGray
Write-Host "npm:   $((& $npm.Source --version).Trim())" -ForegroundColor DarkGray
Write-Host ''

# Pack first, then install the tarball globally. This deliberately avoids a
# global npm link back to the cloned repository, so the source folder can be
# removed after installation without breaking codexm.
$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("codex-monitor-install-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $TempDir | Out-Null

Push-Location $Root
try {
    Write-Host '1/3 Packaging standalone wrapper...' -ForegroundColor Cyan
    $packOutput = & $npm.Source pack --silent --pack-destination $TempDir
    if ($LASTEXITCODE -ne 0) { throw 'npm pack failed.' }
    $packageName = ($packOutput | Select-Object -Last 1).Trim()
    if (-not $packageName) { throw 'npm pack did not return a package filename.' }
    $packagePath = Join-Path $TempDir $packageName
    if (-not (Test-Path $packagePath)) { throw "Package archive was not created: $packagePath" }

    Write-Host '2/3 Installing runtime + ConPTY helper globally...' -ForegroundColor Cyan
    & $npm.Source install -g $packagePath --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Global npm installation failed.' }

    Write-Host '3/3 Verifying commands...' -ForegroundColor Cyan
    $commands = @('codexm', 'codexm-f-l', 'codexm-f-a', 'codexm-l-l', 'codexm-l-a')
    foreach ($name in $commands) {
        $resolved = Get-Command $name -ErrorAction SilentlyContinue
        if (-not $resolved) {
            throw "$name was installed but is not visible on PATH. Open a new terminal and retry."
        }
    }

    & codexm --doctor
    if ($LASTEXITCODE -ne 0) { throw 'codexm --doctor failed.' }
}
finally {
    Pop-Location
    Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host 'Installed successfully.' -ForegroundColor Green
Write-Host ''
Write-Host 'Commands:' -ForegroundColor White
Write-Host '  codexm       Full + Login  (default)' -ForegroundColor Yellow
Write-Host '  codexm-f-l   Full + Login' -ForegroundColor Yellow
Write-Host '  codexm-f-a   Full + API key' -ForegroundColor Yellow
Write-Host '  codexm-l-l   Lite + Login' -ForegroundColor Yellow
Write-Host '  codexm-l-a   Lite + API key' -ForegroundColor Yellow
Write-Host ''
Write-Host 'Demo:' -ForegroundColor White
Write-Host '  codexm --demo' -ForegroundColor Yellow
