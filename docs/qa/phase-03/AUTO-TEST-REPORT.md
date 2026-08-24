# Phase 03 — Auto Test Report

## Trạng thái

**PASS — verified on user Windows working tree.**

## Lệnh chuẩn

```powershell
.\scripts\phase3-verify.ps1
```

Script chạy:

```text
Syntax check
Full cumulative regression: node --test
Focused Phase 03 demand/scheduler/renderer tests
```

## Kết quả người dùng xác nhận

```text
Phase 03 automated verification: PASS
AUTO TEST: PASS
Phase 03 demand/scheduler/diff-renderer gate passed.
```

## Coverage Phase 03 đã PASS

- metric OFF -> collector demand OFF;
- inactive heavy tab -> continuous collector OFF;
- Performance active -> sampler ON; rời view -> OFF;
- Git branch-only không kéo diff/ahead-behind;
- TTL;
- adaptive backoff;
- priority ordering;
- duplicate-run protection;
- central scheduler single-timer semantics;
- instrumentation counters;
- same frame -> 0 write;
- one-row change -> minimal dirty-row diff;
- batched ANSI write;
- bounded ring buffer;
- Phase 01/02 full regression vẫn được chạy.

## PASS condition

```text
Syntax PASS
Full regression FAIL = 0
Focused Phase 03 FAIL = 0
```

**Automated gate Phase 03: PASS.**
