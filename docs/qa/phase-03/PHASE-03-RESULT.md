# Phase 03 — Result

## Trạng thái

**CLOSED — automated verification và manual PTY responsiveness acceptance đều PASS.**

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

## Acceptance đã xác nhận

- Automated verification: PASS.
- Full demand/scheduler/diff-renderer gate: PASS.
- P1-01 PTY responsiveness với scheduler active: PASS.
- Không thấy typing lag rõ do scheduler.
- Không thấy output starvation bất thường do polling.
- Resize không crash.
- `/exit` và terminal lifecycle sạch.

## Chưa làm trong Phase 03

- Full visual Live UI: Phase 04.
- Real heavy Performance/Process collectors: Phase 06/07.
- Decorative animation loop: không thuộc thiết kế v1.
- Persist Performance history: không làm.

## Exit gate

```text
mandatory auto tests PASS
BLOCKER = 0
P0 = 0
P1 manual acceptance PASS
hidden/inactive heavy workloads = 0 in tests
same state = 0 repaint
timer leak = 0 in tests/manual acceptance
```

**Phase 03 đã đóng. Có thể bắt đầu Phase 04.**
