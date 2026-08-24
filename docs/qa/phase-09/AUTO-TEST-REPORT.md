# Phase 09 — Auto Test Report

## Trạng thái

**WAITING USER RUN**

```powershell
.\scripts\phase6-9-verify.ps1
```

Coverage:
- normal/ultrawide layout cell-width invariants;
- Storage entry read-only boundary;
- keyboard + SGR mouse wheel normalization;
- color fallback truecolor -> 256 -> 16 -> mono;
- alternate-screen enter/restore, cursor/raw-mode cleanup;
- History TUI no overflow at representative sizes;
- full cumulative regression.

Automated PASS không thay visual acceptance của user.
