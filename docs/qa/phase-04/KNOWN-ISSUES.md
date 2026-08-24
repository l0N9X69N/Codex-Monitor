# Phase 04 — Known Issues / Deferred

## BLOCKER

Chưa biết cho đến khi `phase4-verify.ps1` và manual visual/responsive acceptance được chạy trên working tree mới nhất.

## P0

Chưa có P0 đã biết trong implementation Phase 04.

## P1 cần nghiệm thu

- Real PTY + reserved HUD rows phải được kiểm tra resize/exit trên Windows Terminal thật.
- Visual hierarchy Color/Mono/Matrix cần user nghiệm thu direction.
- Custom nhiều metric/header/tabs cần kiểm tra bằng terminal thật vì font/cell rendering khác nhau.

## DEFERRED đúng roadmap

- Tools/Resources/Performance/Processes content sâu thuộc Phase 06.
- F4 footer/hook đã hiện; `platform.openHistoryTerminal(...)` hoàn chỉnh thuộc Phase 07 và History thuộc Phase 08+.
- Full current-session collectors để điền mọi Overview metric thuộc các phase collector sau; Phase 04 không được phép fill missing values từ history.
- Session Health threshold cố định chưa chốt; renderer hiện nhận derived health label từ ViewModel/runtime khi có.
- Phase 05 sẽ làm fuzz/snapshot/UX gate mạnh hơn cho Live UI.
