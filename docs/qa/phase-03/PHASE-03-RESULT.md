# Phase 03 — Result

## Trạng thái

**IMPLEMENTED — chờ automated verification và manual PTY responsiveness acceptance.**

## Đã làm

- Demand Graph từ header + enabled tabs + active tab + sections + enabled metrics.
- Collector plan theo từng metric; heavy active-view collectors không chạy chỉ vì tab được enable.
- Git branch/diff/ahead-behind tách demand để branch-only không kéo collector đắt hơn.
- Collector registry + manager với TTL, priority, adaptive backoff và duplicate-run protection.
- Central scheduler dùng một timer trung tâm thay cho nhiều `setInterval()` độc lập.
- Bounded `RingBuffer` cho short-lived performance samples.
- ANSI diff renderer primitive: same frame = 0 write; dirty rows được batch thành một stdout write.
- Test-only performance instrumentation: collectorRuns, pollCount, repaintCount, bytesWritten, durationMs.
- Synthetic PTY load harness để kiểm tra scheduler không làm typing/output Codex bị lag.
- Regression tests Phase 01/02 vẫn chạy trong full suite.

## Chưa làm trong Phase 03

- Full visual Live UI: Phase 04.
- Real heavy Performance/Process collectors: Phase 06/07.
- Decorative animation loop: không thuộc thiết kế v1.
- Persist Performance history: không làm.

## Exit gate còn lại

Chạy:

```powershell
.\scripts\phase3-verify.ps1
```

Sau automated PASS, chạy manual PTY responsiveness test trong `MANUAL-TEST-REQUIRED.md`.
