$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host 'Codex Monitor Wrapper - lightweight installer' -ForegroundColor Cyan

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js was not found. Install Node.js 20-26 first.' }
$major = [int]((& node -p "process.versions.node.split('.')[0]").Trim())
if ($major -lt 20 -or $major -ge 27) { throw "Node.js $major is unsupported. Use Node.js 20-26." }

$codex = Get-Command codex -ErrorAction SilentlyContinue
if (-not $codex) { throw 'Official Codex CLI was not found on PATH. Install @openai/codex first.' }

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
if (-not $npm) { throw 'npm was not found.' }

Write-Host "Node: $((& node --version).Trim())" -ForegroundColor DarkGray
Write-Host "Codex: $($codex.Source)" -ForegroundColor DarkGray
Write-Host ''

Push-Location $Root
try {
    Write-Host '1/3 Installing local runtime dependencies...' -ForegroundColor Cyan
    & $npm.Source install --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        throw 'Local npm dependency installation failed.'
    }

    Write-Host '2/3 Verifying ConPTY helper...' -ForegroundColor Cyan
    & $node.Source --input-type=module -e "import('@homebridge/node-pty-prebuilt-multiarch').then(()=>console.log('PTY module: OK')).catch(e=>{console.error(e);process.exit(1)})"
    if ($LASTEXITCODE -ne 0) {
        throw 'PTY module could not be loaded. The codexm command was not installed.'
    }

    Write-Host '3/3 Registering codexm command...' -ForegroundColor Cyan
    & $npm.Source install -g $Root --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        throw 'Global codexm command registration failed.'
    }
}
finally {
    Pop-Location
}

$codexm = Get-Command codexm -ErrorAction SilentlyContinue
if (-not $codexm) {
    throw 'codexm was installed but is not visible on PATH. Open a new terminal and run codexm --doctor.'
}

Write-Host ''
Write-Host 'Running final check...' -ForegroundColor Cyan
& $codexm.Source --doctor
if ($LASTEXITCODE -ne 0) {
    throw 'codexm --doctor failed.'
}

Write-Host ''
Write-Host 'Installed successfully.' -ForegroundColor Green
Write-Host 'Run:' -ForegroundColor White
Write-Host '  codexm' -ForegroundColor Yellow
