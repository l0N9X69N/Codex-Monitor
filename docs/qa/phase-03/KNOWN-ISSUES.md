# Phase 03 — Known Issues / Deferred

## BLOCKER

Chưa biết cho đến khi `phase3-verify.ps1` và manual PTY responsiveness test được chạy trên working tree mới nhất.

## P0

Chưa có P0 đã biết trong code Phase 03.

## DEFERRED

- Phase 03 mới cung cấp scheduler/collector primitives; real Performance/Process collectors thuộc Phase 06/07.
- Full Live visual/layout integration thuộc Phase 04.
- Scheduler hiện không tạo animation/decorative frame loop; đây là chủ ý theo spec.
- Performance samples chỉ ở bounded RAM ring buffer, không persist.
- PTY load harness dùng synthetic collectors để stress scheduler plumbing, không giả vờ là benchmark CPU/RAM collector thật.
