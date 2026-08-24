# Phase 04 — Result

## Trạng thái

**IMPLEMENTED — chờ automated verification và manual visual/responsive acceptance.**

## Đã làm

- Config schema v1 + presets `recommended/compact/full/custom`.
- Custom giữ quyền chọn sections/metrics/header/tabs/theme; layout vật lý vẫn do engine quyết định.
- Config store local-only + `--config`, `--config-path`, `--configure`, `--reset` foundation.
- Runtime overrides `--preset`, `--theme`, `--lang` không tự ghi config.
- Theme tokens `color`, `mono`, `matrix` tách khỏi data semantics.
- Terminal-cell width helper cho ANSI/Vietnamese/Unicode/emoji; telemetry không word-wrap.
- Responsive lane engine dùng width + height budget, nhiều lane khi đủ rộng và fallback FULL/COMPACT/MICRO/hide.
- Header trái tối đa 4 item; configured tabs bên phải có layout priority cao hơn status text.
- Overview renderer cho Context / Usage / Session / Activity / System Summary khi enabled.
- Login quota có representation wide/compact/micro; API không render Login 5H/WEEK quota.
- Footer `F4 History` đã hiện như hook UI; platform open-terminal thuộc Phase 07.
- Live pane controller reserve hàng dưới terminal, resize debounce ~75ms, batched ANSI diff, clear HUD khi exit.
- Official Codex tiếp tục chạy trong PTY ở cùng terminal; Live pane nhận normalized state và transient PTY state.
- `--demo` + `--demo-state idle|thinking|tool|approval|error` để nghiệm thu states/presets/themes/dimensions.
- Full regression Phase 01–03 vẫn nằm trong verification Phase 04.

## Chưa làm trong Phase 04

- Nội dung sâu Tools/Resources/Performance/Processes: Phase 06.
- Full platform F4 launcher: Phase 07.
- History UI: Phase 08+.
- Full current-session collector wiring cho mọi Overview metric: collector phases sau; renderer giữ `--` cho dữ liệu chưa có evidence.

## Exit gate còn lại

Chạy:

```powershell
.\scripts\phase4-verify.ps1
```

Sau automated PASS, nghiệm thu checklist trong `MANUAL-TEST-REQUIRED.md` trên Windows Terminal ở nhiều kích thước, resize nhanh, theme/preset/custom và Live thật.
