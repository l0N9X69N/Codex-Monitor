# Phase 09 — History Cyberpunk / Netrunner TUI

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor Final Project Specification v1, design freeze 2026-08-24. Nếu tài liệu phase mâu thuẫn với `PROJECT-SPEC.md`, **PROJECT-SPEC.md thắng**.

> **Bổ sung UX đã chốt sau spec:** Live phải hiện đại, gọn, làm nổi bật thông tin cần xem. History giữ tinh thần cyberpunk/hacker/netrunner tương lai nhưng không nhồi tràn lan một màn hình; ưu tiên nhiều panel/biểu đồ có khoảng thở, responsive và chuyển động từ dữ liệu thật.


## Spec liên quan

Spec Phase F; mục 33–38, 49.

## Mục tiêu

Xây full-screen History TUI có cảm giác tương lai/hacker/netrunner, nhưng thoáng, readable và không nhồi mọi analytics lên cùng một màn hình.

## Phạm vi phải làm

- Alternate-screen TUI + safe enter/restore.
- Visual system: dark, neon cyan navigation, green healthy/live, gold/orange pressure, red error, purple secondary.
- Main structure: overview strip, Sessions table, selected session area, detail navigation.
- Tabs: Info/Tokens/Turns/Tools/Resources/Errors; Storage entry point.
- Responsive panel layout; normal terminal ít panel, ultrawide mở thêm panel/chart hợp lý.
- Panel có khoảng thở; active panel nổi bật; neon dùng hierarchy.
- Color capability fallback truecolor -> 256 -> 16 -> mono.
- Keyboard essentials; mouse nếu terminal hỗ trợ.

## Không làm trong phase

- Không sao chép asset/UI cụ thể của game; chỉ giữ tinh thần cyberpunk/netrunner.
- Không 20 panel bé tí trên một màn.
- Không animation giả 30/60 FPS.

## Đầu ra bắt buộc

- History TUI shell.
- History theme tokens.
- Sessions/detail screens.
- Responsive/capability layer.
- Demo gallery normal + ultrawide + mono.

Ngoài ra luôn phải có bộ bàn giao chung:

```text
PHASE-09-RESULT.md
AUTO-TEST-REPORT.md
MANUAL-TEST-REQUIRED.md
KNOWN-ISSUES.md
```

## Auto test

- Alternate-screen sequences.
- Layout invariants.
- Responsive sessions columns.
- Navigation state.
- Keyboard/mouse normalization.
- Capability fallback.
- Unicode width/control-char sanitization.

## Manual test / phần cần người dùng xác nhận

- User nghiệm thu normal và ultrawide.
- Đánh giá: ngầu nhưng readable; panel có khoảng thở; không quá dày; active info nổi bật; cảm giác control-room tương lai.
- Keyboard-only và mouse demo.

Nếu không thể auto test đáng tin, phase phải ghi rõ case trong `MANUAL-TEST-REQUIRED.md`; không được im lặng coi như đã PASS.

## Exit gate

User chốt History visual direction; responsive và terminal restore an toàn.

## Trạng thái ban đầu

```text
NOT STARTED
```
