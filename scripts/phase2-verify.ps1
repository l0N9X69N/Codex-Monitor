$ErrorActionPreference = 'Stop'

Write-Host '== Codex Monitor Phase 02 verification =='

$nodeVersion = node --version
Write-Host "Node: $nodeVersion"

if (-not (Test-Path 'node_modules')) {
  Write-Host 'Installing npm dependencies...'
  npm install
}

npm run verify:phase2
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'AUTO TEST: PASS'
Write-Host 'Phase 02 parser/state gate passed.'
Write-Host 'If you want to validate real PTY wording, see:'
Write-Host '  docs\qa\phase-02\MANUAL-TEST-REQUIRED.md'
