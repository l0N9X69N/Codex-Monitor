# Phase 06 — Known Issues / Deferred

## BLOCKER

Chưa biết cho đến khi `phase6-verify.ps1` + Windows manual gate chạy trên working tree mới nhất.

## P0 cần nghiệm thu

- framed Full HUD phải thực sự >= visual baseline v1 trước refactor trên Windows Terminal thật;
- mọi keyboard byte phải thuộc Codex, không residual shortcut interception;
- current-session binding/quota truth với session JSONL thật;
- HUD/prompt isolation và terminal restore sau output/resize/exit.

## Migration debt còn tồn tại ngoài Phase 06 gate

- repository vẫn còn một số test/code History cũ từ batch 06–09 trước khi PROJECT-SPEC 2026-08-25 đổi contract; chúng sẽ được thay thế tuần tự ở Phase 07–09 và không được dùng làm acceptance cho Phase 06;
- platform contract cũ còn `openHistoryTerminal`; remove/realign thuộc Phase 07;
- old History engine/TUI code chưa được coi là Session Manager implementation; Phase 08/09 sẽ rework hoặc thay thế;
- Linux/macOS chưa có máy thật, để `UNVERIFIED PLATFORM` cho Phase 07.

## Deferred đúng roadmap

- Manager core: Phase 08;
- Manager dashboard: Phase 09;
- selected-session analytics/charts: Phase 10;
- storage/delete: Phase 11;
- updater/package/release: Phase 12;
- polish Live đẹp hơn visual floor: sau khi Phase 06 baseline pass, miễn không đổi passive-input contract.
