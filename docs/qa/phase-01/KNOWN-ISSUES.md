# Phase 01 — Known Issues / Deferred

## BLOCKER

Không có.

## P0

Không có P0 mở.

### Resolved — Windows PTY host không tự thoát

**Triệu chứng trước fix:** official Codex đã `/exit` nhưng wrapper chưa quay lại PowerShell cho đến khi nhấn Ctrl+C thêm một lần.

**Nguyên nhân thực tế:** Windows ConPTY/native PTY dependency có thể còn giữ worker/socket handle của Node host sau khi PTY child đã phát `onExit`; vì vậy chỉ đặt `process.exitCode` chưa đủ để kết thúc wrapper ngay.

**Fix:** sau khi PTY child exit và terminal cleanup hoàn tất, Windows host kết thúc explicit với exit code tương ứng. Logic spawn cũng giữ npm-shim bypass/fallback an toàn.

**Retest:** PASS trên máy Windows thật cho `/exit`, Ctrl+C, crash recovery và resize stress.

## DEFERRED theo roadmap

- Phase 01 chưa vẽ Live HUD; đây là chủ ý, không phải regression.
- Full auth verification từ current rollout/session sẽ được nối sâu hơn khi parser/collector Phase 02 hoàn thiện.
- Platform Adapter đầy đủ Windows/Linux/macOS thuộc Phase 07. Phase 01 chỉ cô lập code PTY hiện tại trong `src/platform/pty.js` để tránh rải OS conditionals.
- `ACTUAL MODEL` giữ unknown cho đến khi có evidence đáng tin; Phase 01 không tạo inference completed-turn = actual model.
- Login 5H/Week không được prefill từ lịch sử; UI quota thuộc các phase Live sau.
