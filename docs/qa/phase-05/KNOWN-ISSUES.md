# Phase 05 — Known Issues / Deferred

## BLOCKER

Chưa biết cho đến khi `phase5-verify.ps1` và manual UX gate được chạy trên working tree mới nhất.

## P0

Chưa có P0 đã biết trong implementation Phase 05.

## P1 cần nghiệm thu

- Canonical demo matrix cần user chốt visual hierarchy trên Windows Terminal thật.
- Resize hysteresis cần kiểm tra bằng kéo terminal thật vì terminal/font/compositor khác nhau.
- Custom nhiều/ít metric cần user đánh giá có còn gọn, không thành telemetry wall.

## RESOLVED DURING PHASE 05

- Thêm lane hysteresis để tránh layout đổi 1/2/3 lane liên tục khi width jitter quanh threshold.
- Fuzz failure có seed + iteration để reproduce.
- Golden snapshots khóa các layout canonical thay vì update hàng loạt vô điều kiện.

## DEFERRED đúng roadmap

- Không thêm view lớn mới trong Phase 05.
- Tools/Resources/Performance/Processes content sâu vẫn thuộc Phase 06.
- Platform-specific launcher/F4 thật thuộc Phase 07.
- History vẫn thuộc Phase 08+.
