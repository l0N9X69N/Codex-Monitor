$ErrorActionPreference = 'Stop'

Write-Host '== Codex Monitor Phase 03 verification =='

$nodeVersion = node --version
Write-Host "Node: $nodeVersion"

if (-not (Test-Path 'node_modules')) {
  Write-Host 'Installing npm dependencies...'
  npm install
}

npm run verify:phase3
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'AUTO TEST: PASS'
Write-Host 'Phase 03 demand/scheduler/diff-renderer gate passed.'
Write-Host 'Manual PTY responsiveness test is still required:'
Write-Host '  docs\qa\phase-03\MANUAL-TEST-REQUIRED.md'
