# Phase 04 — Auto Test Report

## Trạng thái

**PASS — user confirmed on latest Windows working tree.**

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

## Kết quả

User xác nhận automated verification PASS sau patch sửa semantics unknown telemetry (`RAM --`, không biến unknown thành `0`).

Không ghi số lượng test cụ thể vì output count cuối không được lưu trong handoff này.

## Coverage Phase 04 đã PASS

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
- unknown telemetry giữ `--`, actual zero vẫn là `0`;
- Phase 01–03 regression vẫn chạy trong full suite.

## PASS condition

```text
Syntax PASS
Full regression FAIL = 0
Focused Phase 04 FAIL = 0
```

**Automated gate Phase 04: PASS.**
