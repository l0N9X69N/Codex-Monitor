# Phase 01 — Known Issues / Deferred

## BLOCKER

Chưa biết cho đến khi manual PTY test trên Windows được chạy.

## P0

Chưa biết cho đến khi manual PTY test hoàn tất.

## DEFERRED theo roadmap

- Phase 01 chưa vẽ Live HUD; đây là chủ ý, không phải regression.
- Full auth verification từ current rollout/session sẽ được nối sâu hơn khi parser/collector Phase 02 hoàn thiện.
- Platform Adapter đầy đủ Windows/Linux/macOS thuộc Phase 07. Phase 01 chỉ cô lập code PTY hiện tại trong `src/platform/pty.js` để tránh rải OS conditionals.
- `ACTUAL MODEL` giữ unknown cho đến khi có evidence đáng tin; Phase 01 không tạo inference completed-turn = actual model.
- Login 5H/Week không được prefill từ lịch sử; UI quota thuộc các phase Live sau.
