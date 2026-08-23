@echo off
setlocal
npm uninstall -g codex-monitor-wrapper
if errorlevel 1 (
  echo Uninstall failed.
  pause
  exit /b 1
)
echo Codex Monitor Wrapper removed. Official Codex was not modified.
pause
