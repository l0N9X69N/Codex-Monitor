$ErrorActionPreference = 'Stop'

Write-Host '== Codex Monitor Phase 04 verification =='

$nodeVersion = node --version
Write-Host "Node: $nodeVersion"

if (-not (Test-Path 'node_modules')) {
  Write-Host 'Installing npm dependencies...'
  npm install
}

npm run verify:phase4
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'AUTO TEST: PASS'
Write-Host 'Phase 04 responsive Live UI/config gate passed.'
Write-Host 'Manual visual/responsive acceptance is still required:'
Write-Host '  docs\qa\phase-04\MANUAL-TEST-REQUIRED.md'
