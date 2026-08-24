# Phase 01 — Result

## Trạng thái

**IMPLEMENTED — chờ manual PTY/terminal acceptance trên máy người dùng.**

## Đã làm

- Current-run hard reset; telemetry mới bắt đầu bằng `null/--` semantics, không carry từ run trước.
- Auth detection/override: `--auth`, `CODEX_API_KEY`, `codex login status`; không in secret.
- API/Login child isolation cho explicit override.
- Requested/Actual model state tách riêng; `ACTUAL` không tự suy đoán.
- Freshness `waiting/current/stale`.
- Session binding rule không chấp nhận mtime đơn thuần; hỗ trợ session mới và resumed session chỉ khi có current-run append evidence.
- Activity priority helper.
- PTY wrapper baseline cho official Codex, chưa render HUD ở Phase 01.
- TerminalGuard + process safety cho signal/fatal paths.
- CLI contract tối thiểu: `--help`, `--doctor`, `--monitor-version`, `--auth`, `--` passthrough.
- Automated unit/integration tests + PowerShell verification script.

## Cố ý chưa làm

- Live HUD/Custom/Responsive UI: Phase 04.
- Heavy collectors/views: Phase 03/06.
- Cross-platform adapter hoàn chỉnh: Phase 07.
- History: Phase 08+.

## Gate còn lại

Manual PTY/terminal tests trong `MANUAL-TEST-REQUIRED.md` phải PASS trên máy thật trước khi Phase 01 được coi là CLOSED.
