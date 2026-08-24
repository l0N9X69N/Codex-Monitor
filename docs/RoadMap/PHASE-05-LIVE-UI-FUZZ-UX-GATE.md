# Phase 05 — Live UI Fuzz, Snapshot & UX Gate

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor Final Project Specification v1, design freeze 2026-08-24. Nếu tài liệu phase mâu thuẫn với `PROJECT-SPEC.md`, **PROJECT-SPEC.md thắng**.

> **Bổ sung UX đã chốt sau spec:** Live phải hiện đại, gọn, làm nổi bật thông tin cần xem. History giữ tinh thần cyberpunk/hacker/netrunner tương lai nhưng không nhồi tràn lan một màn hình; ưu tiên nhiều panel/biểu đồ có khoảng thở, responsive và chuyển động từ dữ liệu thật.

## Spec liên quan

Spec mục 25–30 và checklist UI/performance mục 63.

## Mục tiêu

Không thêm feature lớn; phá Live UI bằng automation và manual UX review trước khi mở rộng views.

## Phạm vi phải làm

- Property/fuzz test cho width/height, sections, metrics, header, tabs, theme, auth, Unicode.
- Canonical golden snapshots cho nhiều terminal sizes.
- Resize sequence/hysteresis tests.
- UX hierarchy review: Activity, context pressure, Login quota, secondary labels.
- Reproducible fuzz seed khi fail.

## Không làm trong phase

- Không thêm view lớn mới.
- Không sửa snapshot hàng loạt chỉ để test xanh.

## Đầu ra bắt buộc

- Layout fuzz runner.
- Golden snapshot suite.
- Canonical demo frames/screenshots.
- Manual UX checklist.

Ngoài ra luôn phải có bộ bàn giao chung:

```text
PHASE-05-RESULT.md
AUTO-TEST-REPORT.md
MANUAL-TEST-REQUIRED.md
KNOWN-ISSUES.md
```

## Auto test

- Hàng nghìn tổ hợp không crash/overflow/wrap/negative width.
- HUD rows <= budget.
- ANSI reset đầy đủ.
- Navigation usable.
- Wide->narrow->wide và threshold jitter ổn định.

## Manual test / phần cần người dùng xác nhận

- Trả 5–10 layout đại diện cùng lệnh demo và expected look.
- User đánh giá: dễ đọc, không quá cao, primary metric nổi bật, Custom hợp lý.

Nếu không thể auto test đáng tin, phase phải ghi rõ case trong `MANUAL-TEST-REQUIRED.md`; không được im lặng coi như đã PASS.

## Exit gate

0 layout invariant failure; 0 P0 UI bug; user chốt Live visual.

## Trạng thái hiện tại

```text
CLOSED
```

Phase 05 đã PASS deterministic fuzz/snapshot/hysteresis/UX automation và manual Live review. Manual test đã phát hiện một lỗi HUD đè prompt; lỗi được sửa bằng terminal scroll-region isolation và user retest PASS.

Final gate:

```text
Automated verification        PASS
Layout invariant failures     0
P0 UI bugs                     0
Open Phase 05 P1              0
Manual Live visual acceptance PASS
HUD/prompt isolation          PASS
```
