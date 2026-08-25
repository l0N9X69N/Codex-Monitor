$ErrorActionPreference = 'Stop'

Write-Host 'Codex Monitor Phase 06 verification'
node .\scripts\phase6-auto-verify.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'AUTO TEST: PASS'
Write-Host 'Next: complete docs/qa/phase-06/MANUAL-TEST-REQUIRED.md on Windows Terminal.'
