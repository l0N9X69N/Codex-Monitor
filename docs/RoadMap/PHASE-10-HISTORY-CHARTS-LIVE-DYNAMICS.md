# Phase 10 — History Charts & Live Dynamics

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor Final Project Specification v1, design freeze 2026-08-24. Nếu tài liệu phase mâu thuẫn với `PROJECT-SPEC.md`, **PROJECT-SPEC.md thắng**.

> **Bổ sung UX đã chốt sau spec:** Live phải hiện đại, gọn, làm nổi bật thông tin cần xem. History giữ tinh thần cyberpunk/hacker/netrunner tương lai nhưng không nhồi tràn lan một màn hình; ưu tiên nhiều panel/biểu đồ có khoảng thở, responsive và chuyển động từ dữ liệu thật.


## Spec liên quan

Spec mục 34, 44–45, 48.

## Mục tiêu

Thêm 5 chart + event timeline; History trông sống động nhờ data thật.

## Phạm vi phải làm

- Context over turns/time.
- Token I/O per turn.
- Cumulative tokens.
- Turn duration.
- Tool calls per turn/time.
- Event timeline retry/error/compaction.
- Chart data model tách renderer.
- Live-tail thêm point/event đúng lúc, không duplicate.
- Renderer fallback Braille -> Unicode blocks -> ASCII.
- Responsive: không ép cả 5 chart xuất hiện cùng lúc; chart gắn vào view/tab phù hợp.
- Chỉ repaint panel thay đổi; không fake past data.

## Không làm trong phase

- Không historical CPU/RAM/process tree.
- Không decorative animation.

## Đầu ra bắt buộc

- Chart engine + 3 representation levels.
- Event timeline.
- Live-tail chart integration.
- Golden chart snapshots.

Ngoài ra luôn phải có bộ bàn giao chung:

```text
PHASE-10-RESULT.md
AUTO-TEST-REPORT.md
MANUAL-TEST-REQUIRED.md
KNOWN-ISSUES.md
```

## Auto test

- Known series -> known bounds/shape.
- Compaction marker/context drop.
- Turn complete -> duration point.
- Append không duplicate.
- Resize reflow.
- Braille/block/ASCII giữ semantics.
- Same data -> no repaint.
- Missing/empty values safe.

## Manual test / phần cần người dùng xác nhận

- Mở History cùng live Codex và quan sát chart update theo turn thật.
- Ultrawide.
- Low-capability terminal.
- Idle CPU không tăng do animation loop.

Nếu không thể auto test đáng tin, phase phải ghi rõ case trong `MANUAL-TEST-REQUIRED.md`; không được im lặng coi như đã PASS.

## Exit gate

Chart correctness xanh, live update không duplicate/memory leak, movement chỉ từ source data.

## Trạng thái ban đầu

```text
NOT STARTED
```
