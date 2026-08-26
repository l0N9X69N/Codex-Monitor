# Phase 08 — Auto Test Report

## Trạng thái

**PASS — reported on local Windows checkout after lightweight global session row checkpoint.**

Run used:

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
- global row có state/project/model/elapsed/tokens/context/turn/tool/last activity/error/retry/compaction/file size;
- lightweight summary bootstrap bị giới hạn byte và chỉ áp dụng cho một số session gần nhất;
- session ngoài bootstrap chỉ bắt đầu incremental observation từ khi Manager chạy;
- tail-only summary không fabricate total turn/tool count: count không đầy đủ giữ `null`;
- append được aggregate theo byte offset, không duplicate; large observation gap degrade count về unknown;
- truncate reset bounded summary an toàn;
- selected deep model có thể upgrade lightweight row sang exact totals;
- partial append/no duplicate/truncate/external delete;
- deterministic All/Live/Ended/Search/Sort;
- no SQLite/CSV/history DB created;
- Phase 07 platform regression.

Automated checkpoint PASS chưa tự động đóng Phase 08. Manual multi-terminal/performance acceptance vẫn là exit gate cuối.
