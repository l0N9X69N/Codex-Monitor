$ErrorActionPreference = 'Stop'

Write-Host 'Codex Monitor - uninstall' -ForegroundColor Cyan
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
if (-not $npm) { throw 'npm was not found.' }

& $npm.Source uninstall -g codex-monitor-wrapper --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Uninstall failed.' }

Write-Host ''
Write-Host 'Codex Monitor removed.' -ForegroundColor Green
Write-Host 'Official Codex, login state, and ~/.codex data were not modified.' -ForegroundColor DarkGray
