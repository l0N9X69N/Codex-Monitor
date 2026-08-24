# Phase 07 — Manual Test Required

## Windows — phải test trong batch này

1. `node .\src\cli\codexm.js --preset full`
2. typing + resize + Ctrl+C + `/exit`.
3. Performance/Processes có system/process telemetry hoặc degrade `--` an toàn.
4. Nhấn F4: History mở terminal/tab mới; Live Codex vẫn chạy.
5. `node .\src\cli\codexm.js --config-path` trả path Windows hợp lý.
6. Sau exit terminal restore scroll region/raw mode sạch.

**PASS:** không crash, không HUD/prompt overlap, F4 launcher hoạt động hoặc in fallback chính xác.

## Linux

**UNVERIFIED PLATFORM** — hiện không có máy Linux.

## macOS

**UNVERIFIED PLATFORM** — hiện không có máy macOS.

Hai platform trên không phải blocker cho Windows development batch, nhưng Phase 07 release-quality cross-platform gate chưa được coi là fully verified cho tới khi có môi trường test thật/CI.
