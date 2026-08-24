# Phase 05 — Known Issues / Deferred

## BLOCKER

**0**

## P0

**0 open P0 issues.**

## P1

**0 open Phase 05 P1 acceptance issues.**

## RESOLVED DURING PHASE 05

- Thêm lane hysteresis để tránh layout đổi 1/2/3 lane liên tục khi width jitter quanh threshold.
- Fuzz failure có seed + iteration để reproduce.
- Golden snapshots khóa các layout canonical thay vì update hàng loạt vô điều kiện.
- Very-short terminal geometry không còn reserve HUD vượt quá terminal height; Monitor tự giảm/hide HUD rows để giữ tối thiểu 8 rows cho Codex child PTY.
- Unknown numeric telemetry giữ `--` thay vì bị coercion thành `0`.
- Manual test phát hiện HUD có thể đè prompt. Đã sửa bằng terminal scroll-region isolation: Codex child chỉ scroll/vẽ trong reserved viewport, HUD nằm ngoài vùng scroll; region được cập nhật khi resize và restore khi exit. User retest PASS.

## DEFERRED đúng roadmap

- Không thêm view lớn mới trong Phase 05.
- Tools/Resources/Performance/Processes content sâu vẫn thuộc Phase 06.
- Platform-specific launcher/F4 thật thuộc Phase 07.
- History vẫn thuộc Phase 08+.
