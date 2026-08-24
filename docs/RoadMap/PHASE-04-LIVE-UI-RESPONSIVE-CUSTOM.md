# Phase 04 — Live Monitor UI hiện đại + Responsive + Custom

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor Final Project Specification v1, design freeze 2026-08-24. Nếu tài liệu phase mâu thuẫn với `PROJECT-SPEC.md`, **PROJECT-SPEC.md thắng**.

> **Bổ sung UX đã chốt sau spec:** Live phải hiện đại, gọn, làm nổi bật thông tin cần xem. History giữ tinh thần cyberpunk/hacker/netrunner tương lai nhưng không nhồi tràn lan một màn hình; ưu tiên nhiều panel/biểu đồ có khoảng thở, responsive và chuyển động từ dữ liệu thật.

## Spec liên quan

Spec Phase D; mục 11–15, 20, 24–26, 50–52.

## Mục tiêu

Xây Live UI v1 gọn, hiện đại, semantic-color rõ, hỗ trợ nhiều lane/cột Custom nhưng luôn giữ đủ không gian cho Codex.

## Phạm vi phải làm

- Header hai vùng: trái tối đa 4 status items, phải là configured tabs; navigation có layout priority cao.
- Theme tokens: Color mặc định, Mono, Matrix; background chỉ vùng HUD theo spec.
- Presets: Recommended, Compact, Full, Custom dùng cùng normalized state.
- Custom chọn sections/metrics/header/tabs/theme; user không quản lý số cột/width.
- Responsive lane engine: REGULAR/SMALL/INLINE; min/preferred/max width; height budget; stretch weight.
- Metric representation FULL/COMPACT/MICRO; fallback full -> compact -> micro -> truncate -> hide optional -> minimal.
- Không telemetry word-wrap; Unicode/Tiếng Việt/emoji dùng terminal-cell width.
- Resize debounce + hysteresis + atomic repaint.
- Overview hoàn chỉnh: Context/Usage/Session/Activity/System Summary khi demanded.
- Login: 5H/WEEK đủ lớn, dễ scan; API: không có Login quota.
- F4 History hook hiển thị sẵn; platform launcher hoàn thiện ở P07.
- `codexm --configure` foundation: language/preset/sections-metrics/tabs/header/theme/preview/save.

## Không làm trong phase

- Chưa hoàn thiện nội dung sâu của Tools/Resources/Performance/Processes.
- Chưa làm History UI.

## Đầu ra bắt buộc

- One responsive Live renderer semantics.
- Overview production-ready.
- Config schema/version + Custom foundation.
- Demo mode cho states/presets/dimensions.
- Theme tokens tách logic dữ liệu.

Ngoài ra luôn phải có bộ bàn giao chung:

```text
PHASE-04-RESULT.md
AUTO-TEST-REPORT.md
MANUAL-TEST-REQUIRED.md
KNOWN-ISSUES.md
```

## Auto test

- Width/height matrix.
- API/Login snapshots.
- Header 0–4 items; tab responsive.
- Section/metric ON/OFF; lane stacking.
- Unicode display width.
- No-wrap + row-budget invariants.
- Login quota wide/normal/micro; API quota absent.
- Color/Mono/Matrix không đổi semantics.

## Manual test / phần cần người dùng xác nhận

- Windows Terminal nhỏ/vừa/ultrawide; font size khác nhau.
- Kéo resize nhanh.
- Tiếng Việt + flag/fallback.
- Custom cực ít và cực nhiều metric.
- Header 4 item + nhiều tabs.
- Đánh giá Live có gọn, hiện đại, nổi đúng dữ liệu chính hay không.

Nếu không thể auto test đáng tin, phase phải ghi rõ case trong `MANUAL-TEST-REQUIRED.md`; không được im lặng coi như đã PASS.

## Exit gate

Live gọn, readable, không overflow/wrap; Custom tự layout; user nghiệm thu direction.

## Trạng thái hiện tại

```text
IMPLEMENTED — WAITING AUTOMATED VERIFICATION + MANUAL VISUAL/RESPONSIVE ACCEPTANCE
```

Implementation đã có config/presets/custom foundation, cell-width + responsive lane engine, Overview renderer, Login/API quota semantics, Color/Mono/Matrix, Live pane runtime, demo mode và Phase 04 test harness.

Chạy:

```powershell
.\scripts\phase4-verify.ps1
```

Sau automated PASS, làm checklist trong `docs/qa/phase-04/MANUAL-TEST-REQUIRED.md` trước khi chuyển sang `CLOSED`.
