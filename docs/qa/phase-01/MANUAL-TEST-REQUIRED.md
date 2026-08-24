# Phase 01 — Manual Test Required

## Trạng thái

**COMPLETED — tất cả manual PTY/terminal acceptance cases đã PASS trên máy Windows thật.**

## Kết quả

| Case | Kết quả | Ghi chú |
|---|---|---|
| P0-01 — Codex exit bình thường | PASS | `/exit` quay lại PowerShell ngay sau fix lifecycle Windows PTY. |
| P0-02 — Ctrl+C / interrupt | PASS | Không còn cần Ctrl+C bổ sung để dọn wrapper sau khi Codex kết thúc. |
| P0-03 — Injected monitor crash | PASS | Wrapper fail theo dự kiến và terminal được phục hồi. |
| P1-04 — Resize stress | PASS | Resize liên tục không làm Codex/wrapper crash; terminal bình thường sau exit. |
| P0-05 — Login -> API isolation | PASS | Forced API không reuse ChatGPT Login; khi thiếu API auth, Codex yêu cầu API login thay vì dùng ChatGPT hiện tại. |
| P0-06 — API -> Login explicit override | PASS | `--auth login` vào đúng Login flow/mode, không bị API override. |

## Terminal acceptance

Sau normal exit, Ctrl+C, resize và injected crash:

- PowerShell nhận input bình thường;
- Enter/Backspace hoạt động;
- terminal không bị kẹt raw mode;
- cursor không bị mất;
- wrapper không còn giữ process sống sau khi Codex đã exit.

## Kết luận

Không còn manual gate nào của Phase 01 đang chờ xác nhận.
