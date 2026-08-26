# Phase 08 — Auto Test Report

## Trạng thái

**WAITING USER RUN — selected-session detail checkpoint**

Run:

```powershell
npm run verify:phase8
```

Coverage hiện tại:

- `--manager` là Monitor-owned và không spawn Codex;
- `--history` được forward cho official Codex;
- 1000+ session discovery không full-read/deep-parse session bodies;
- bounded identity probe lấy thread/cwd/project/model mà không tạo deep-cache entry;
- mtime-only không claim LIVE;
- file growth/process identity match là strong LIVE evidence;
- process telemetry unavailable không claim ENDED;
- LIVE evidence giữ grace window qua idle poll ngắn;
- known-session refresh chỉ stat các file đã index, không recursive discovery mỗi tick;
- discovery/process/known-refresh/selected-tail có cadence độc lập;
- process collector không chạy mỗi tick;
- selected session mới deep parse/tail;
- release/chuyển selection nhả deep-cache cũ;
- selected detail có contract ổn định cho `Info/Tokens/Turns/Tools/Resources/Errors`;
- missing historical values giữ `null`/empty, không fabricate cost/system resources;
- selected detail cập nhật sau incremental tail và biến mất khi release selection;
- partial append/no duplicate/truncate/external delete;
- deterministic All/Live/Ended/Search/Sort;
- no SQLite/CSV/history DB created;
- Phase 07 platform regression.

PASS checkpoint này chưa đóng Phase 08. Còn manual multi-terminal/performance gate và rà completeness của lightweight global row trước khi close.
