$ErrorActionPreference = 'Stop'

Write-Host 'Codex Monitor Batch Phase 06-09 verification'
node .\scripts\phase6-9-auto-verify.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'AUTO TEST: PASS'
Write-Host 'Next: run the combined Windows manual checklist in docs/qa/phase-06 through phase-09.'
