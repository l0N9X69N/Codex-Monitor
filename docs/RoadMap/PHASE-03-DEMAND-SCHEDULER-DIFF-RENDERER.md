# Phase 03 — Demand Graph, Central Scheduler & ANSI Diff Renderer

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor Final Project Specification v1, design freeze 2026-08-24. Nếu tài liệu phase mâu thuẫn với `PROJECT-SPEC.md`, **PROJECT-SPEC.md thắng**.

> **Bổ sung UX đã chốt sau spec:** Live phải hiện đại, gọn, làm nổi bật thông tin cần xem. History giữ tinh thần cyberpunk/hacker/netrunner tương lai nhưng không nhồi tràn lan một màn hình; ưu tiên nhiều panel/biểu đồ có khoảng thở, responsive và chuyển động từ dữ liệu thật.

## Spec liên quan

Spec Phase B; mục 27–30, 58–59.

## Mục tiêu

Thực thi 4 luật performance: không dùng thì không collect/poll/repaint; PTY luôn quan trọng hơn telemetry.

## Phạm vi phải làm

- Demand Graph từ config + header + enabled tabs + active tab + enabled metrics.
- Collector Plan theo từng metric, không chỉ từng tab.
- Central scheduler thay cho nhiều `setInterval()` độc lập.
- TTL, freshness, cost tracking, adaptive backoff, duplicate-run protection.
- Bounded ring buffers cho short-lived Performance data.
- Frame diff + batched ANSI output; state không đổi thì 0 repaint.
- Test-only instrumentation: collectorRuns, pollCount, repaintCount, bytesWritten, duration.

## Không làm trong phase

- Chưa làm toàn bộ visual Live.
- Không animation loop trang trí.
- Không persist Performance history.

## Đầu ra bắt buộc

- Demand graph API.
- Collector registry/manager.
- Central scheduler.
- Diff renderer primitive.
- Performance instrumentation.

Ngoài ra luôn phải có bộ bàn giao chung:

```text
PHASE-03-RESULT.md
AUTO-TEST-REPORT.md
MANUAL-TEST-REQUIRED.md
KNOWN-ISSUES.md
```

## Auto test

- Metric OFF -> collector OFF.
- Tab enabled nhưng inactive -> heavy continuous collector OFF.
- Performance active -> sampler ON; rời view -> OFF nếu hết consumer.
- Git branch-only -> không diff/ahead-behind.
- TTL/backoff/priority hoạt động.
- Same frame -> 0 write.
- One-row change -> minimal diff.
- Ring buffers bounded.

## Manual test / phần cần người dùng xác nhận

- Chạy output dài/tool-heavy để kiểm tra cảm giác typing/PTY không bị lag khi collectors active.

Nếu không thể auto test đáng tin, phase phải ghi rõ case trong `MANUAL-TEST-REQUIRED.md`; không được im lặng coi như đã PASS.

## Exit gate

Hidden/inactive heavy workloads bằng 0 trong test; same state bằng 0 repaint; không timer leak.

## Trạng thái hiện tại

```text
CLOSED — automated verification PASS + manual PTY responsiveness PASS
```

Phase 03 đã đạt exit gate. Các hạng mục Live visual/layout tiếp tục ở Phase 04; real heavy collectors ở Phase 06/07.
