# Phase 04 — Auto Test Report

## Trạng thái

**WAITING USER RUN**

## Lệnh chuẩn

```powershell
.\scripts\phase4-verify.ps1
```

Script chạy:

```text
Syntax check
Full cumulative regression: node --test
Focused Phase 04 UI/live-pane tests
```

## Coverage Phase 04

- config schema v1 / preset / runtime override semantics;
- header max 4;
- at least one tab;
- Vietnamese/Unicode/emoji/ANSI terminal-cell width;
- width/height matrix;
- no-wrap + row-budget invariant;
- responsive lane count/stacking;
- navigation priority ở width hẹp;
- Login quota hiện, API quota Login absent;
- Color/Mono/Matrix giữ cùng textual semantics;
- canonical IDLE/THINKING/TOOL/APPROVAL/ERROR labels;
- live pane reserve rows cho child PTY;
- same frame -> 0 write;
- resize debounce + new geometry;
- dispose clears HUD/timers;
- Phase 01–03 regression vẫn chạy trong full suite.

## PASS condition

```text
Syntax PASS
Full regression FAIL = 0
Focused Phase 04 FAIL = 0
```

Automated PASS chưa tự đóng phase vì Phase 04 cần manual visual/responsive acceptance.
