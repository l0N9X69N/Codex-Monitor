# Phase 01 — Result

## Trạng thái

**CLOSED — automated gate và manual PTY/terminal acceptance đã PASS.**

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
- Windows PTY lifecycle đã được harden để wrapper thực sự kết thúc sau khi Codex exit.
- CLI contract tối thiểu: `--help`, `--doctor`, `--monitor-version`, `--auth`, `--` passthrough.
- Automated unit/integration tests + PowerShell verification script.

## Manual acceptance đã xác nhận

- P0-01 — Codex `/exit` quay lại PowerShell bình thường: PASS.
- P0-02 — Ctrl+C / interrupt không để wrapper treo: PASS.
- P0-03 — injected monitor crash phục hồi terminal: PASS.
- P1-04 — resize stress: PASS.
- P0-05 — Login -> API isolation / forced API behavior: PASS.
- P0-06 — API -> Login explicit override: PASS.
- Terminal sau exit/crash không bị kẹt raw mode, cursor hay input: PASS.

## Cố ý chưa làm

- Live HUD/Custom/Responsive UI: Phase 04.
- Heavy collectors/views: Phase 03/06.
- Cross-platform adapter hoàn chỉnh: Phase 07.
- History: Phase 08+.

## Exit gate

```text
mandatory auto tests PASS
BLOCKER = 0
P0 = 0
manual P0/P1 confirmed
required deliverables complete
```

**Phase 01 đã đóng. Có thể bắt đầu Phase 02.**
