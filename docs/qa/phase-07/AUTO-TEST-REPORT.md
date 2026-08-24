# Phase 07 — Auto Test Report

## Trạng thái

**WAITING USER RUN**

```powershell
.\scripts\phase6-9-verify.ps1
```

Automated coverage:
- full adapter contract qua fake adapter;
- resolver win32/linux/darwin không execute native command;
- CODEX_HOME/path semantics;
- POSIX elapsed-time parser variants;
- F4 History routing qua adapter;
- unsupported paths degrade có cấu trúc;
- full regression.

Automated contract PASS không đồng nghĩa real-platform PASS.

```text
Windows  needs manual verification
Linux    UNVERIFIED PLATFORM
macOS    UNVERIFIED PLATFORM
```
