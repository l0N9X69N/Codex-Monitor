# Phase 01 — Correctness & Terminal Safety

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor Final Project Specification v1, design freeze 2026-08-24. Nếu tài liệu phase mâu thuẫn với `PROJECT-SPEC.md`, **PROJECT-SPEC.md thắng**.

> **Bổ sung UX đã chốt sau spec:** Live phải hiện đại, gọn, làm nổi bật thông tin cần xem. History giữ tinh thần cyberpunk/hacker/netrunner tương lai nhưng không nhồi tràn lan một màn hình; ưu tiên nhiều panel/biểu đồ có khoảng thở, responsive và chuyển động từ dữ liệu thật.


## Spec liên quan

Spec Phase A; các mục 7–10, 21–24, 57.

## Mục tiêu

Làm Live Monitor đáng tin trước khi mở rộng UI: current-run only, auth đúng, không stale leak, terminal luôn được phục hồi.

## Phạm vi phải làm

- Hard reset mọi telemetry current-session khi `codexm` khởi động; giữ rõ `0` khác `--`.
- Auto-detect `login/api/other|unknown`; `--auth` override thắng; verify lại khi current session xuất hiện.
- API tuyệt đối không inherit 5H/Week của Login; Login không lấy quota/context/token cũ để lấp startup.
- Tách `MODEL` và `ACTUAL`; không có evidence đáng tin thì `ACTUAL --`.
- Chuẩn hóa freshness `waiting/current/stale`.
- Bind đúng current rollout/session; không chọn rollout cũ chỉ vì mtime gần.
- Giữ priority state `ERROR > APPROVAL > TOOL > THINKING > IDLE`.
- Tạo terminal cleanup/recovery P0 cho normal exit, Codex exit, signal, exception, PTY/resize failure.

## Không làm trong phase

- Chưa làm History TUI.
- Chưa redesign Custom/layout lớn.
- Chưa làm heavy collectors.

## Đầu ra bắt buộc

- Current-run reset + auth isolation + freshness implementation.
- Terminal restore layer.
- Regression fixtures Login/API/stale rollout.
- Unit/integration tests cho correctness.

Ngoài ra luôn phải có bộ bàn giao chung:

```text
PHASE-01-RESULT.md
AUTO-TEST-REPORT.md
MANUAL-TEST-REQUIRED.md
KNOWN-ISSUES.md
```

## Auto test

- Startup -> telemetry current-run là unknown.
- `0` không bị biến thành `--` và ngược lại.
- Login old session -> new API không có Login quota.
- API old session -> new Login không có token/context cũ.
- Actual Model không tự copy từ requested model.
- Freshness transitions.
- Current session selection.
- Cleanup idempotent và được gọi ở các simulated exit paths.

## Manual test / phần cần người dùng xác nhận

- Ctrl+C khi idle và khi tool đang chạy.
- Codex exit bình thường.
- Dev-mode forced exception.
- Resize liên tục rồi exit.
- Login -> đóng -> API và API -> đóng -> Login.
- Kiểm tra terminal không bị mất cursor/raw-mode/scroll-region.

Nếu không thể auto test đáng tin, phase phải ghi rõ case trong `MANUAL-TEST-REQUIRED.md`; không được im lặng coi như đã PASS.

## Exit gate

Không còn stale telemetry/API-Login leak/terminal corruption/Actual Model guessing.

## Trạng thái ban đầu

```text
NOT STARTED
```
