$ErrorActionPreference = "Stop"

Write-Host "== Codex Monitor Phase 01 verification ==" -ForegroundColor Cyan

$nodeVersion = node --version
if (-not $nodeVersion) { throw "Node.js was not found on PATH." }
$major = [int](($nodeVersion -replace '^v','').Split('.')[0])
if ($major -lt 20 -or $major -ge 27) {
  throw "Node.js 20-26 is required. Found $nodeVersion"
}
Write-Host "Node: $nodeVersion" -ForegroundColor Green

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
}

npm run verify:phase1
if ($LASTEXITCODE -ne 0) { throw "Automated Phase 01 verification failed." }

Write-Host "`n== Doctor ==" -ForegroundColor Cyan
node .\src\cli\codexm.js --doctor
if ($LASTEXITCODE -ne 0) {
  throw "Doctor failed. Ensure official Codex CLI is installed and available as 'codex'."
}

Write-Host "`nAUTO TEST: PASS" -ForegroundColor Green
Write-Host "Manual PTY/terminal tests are still required:" -ForegroundColor Yellow
Write-Host "  docs\qa\phase-01\MANUAL-TEST-REQUIRED.md"
Write-Host "`nTo run the wrapper baseline:" -ForegroundColor Cyan
Write-Host "  node .\src\cli\codexm.js"
