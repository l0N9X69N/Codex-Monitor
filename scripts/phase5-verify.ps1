$ErrorActionPreference = 'Stop'

Write-Host '== Codex Monitor Phase 05 verification =='

$nodeVersion = node --version
Write-Host "Node: $nodeVersion"

if (-not (Test-Path 'node_modules')) {
  Write-Host 'Installing npm dependencies...'
  npm install
}

npm run verify:phase5
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'AUTO TEST: PASS'
Write-Host 'Phase 05 Live UI fuzz/snapshot/UX gate passed.'
Write-Host 'Manual visual UX acceptance is still required:'
Write-Host '  docs\qa\phase-05\MANUAL-TEST-REQUIRED.md'
Write-Host 'Canonical demo matrix:'
Write-Host '  npm run demo:phase5'
