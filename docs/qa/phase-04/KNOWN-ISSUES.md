# Phase 04 — Known Issues / Deferred

## BLOCKER

**0**

## P0

**0**

## P1

**0 open for Phase 04.**

Manual visual/responsive acceptance đã PASS trên Windows Terminal.

## Resolved during acceptance

- Unknown System RAM từng format sai thành `0`; đã sửa để unknown giữ `--` và chỉ actual zero mới hiển thị `0`.

## DEFERRED đúng roadmap

- Tools/Resources/Performance/Processes content sâu thuộc Phase 06.
- F4 footer/hook đã hiện; `platform.openHistoryTerminal(...)` hoàn chỉnh thuộc Phase 07 và History thuộc Phase 08+.
- Full current-session collectors để điền mọi Overview metric thuộc các phase collector sau; Phase 04 không được phép fill missing values từ history.
- Session Health threshold cố định chưa chốt; renderer hiện nhận derived health label từ ViewModel/runtime khi có.
- Phase 05 sẽ làm fuzz/snapshot/UX gate mạnh hơn cho Live UI.
