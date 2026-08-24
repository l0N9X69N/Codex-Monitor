# Phase 03 — Known Issues / Deferred

## BLOCKER

Không có.

## P0

Không có P0 mở.

## P1

Không có P1 mở.

## DEFERRED

- Phase 03 mới cung cấp scheduler/collector primitives; real Performance/Process collectors thuộc Phase 06/07.
- Full Live visual/layout integration thuộc Phase 04.
- Scheduler hiện không tạo animation/decorative frame loop; đây là chủ ý theo spec.
- Performance samples chỉ ở bounded RAM ring buffer, không persist.
- PTY load harness dùng synthetic collectors để stress scheduler plumbing, không giả vờ là benchmark CPU/RAM collector thật.

Các mục deferred trên là scope của phase sau, không phải blocker của Phase 03.
