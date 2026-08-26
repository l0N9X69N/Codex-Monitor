# Phase 08 — Auto Test Report

## Trạng thái

**WAITING USER RUN — identity/process correlation checkpoint**

Run:

```powershell
npm run verify:phase8
```

Coverage hiện tại:

- `--manager` là Monitor-owned và không spawn Codex;
- `--history` được forward cho official Codex;
- 1000+ session discovery không full-read/deep-parse session bodies;
- bounded identity probe đọc tối đa đầu rollout để lấy thread/cwd/project/model;
- identity enrichment không đặt `parsed=true` và không tạo deep-cache entry;
- mtime-only không claim LIVE;
- file growth là strong LIVE evidence;
- process match chỉ được coi là strong khi session có thread identity matchable;
- process telemetry unavailable không được dùng để claim ENDED;
- LIVE evidence được giữ trong grace window qua idle poll ngắn;
- multi-session growth độc lập;
- selected-session-only deep parse;
- historical provenance;
- partial append/no duplicate/truncate/external delete;
- deterministic All/Live/Ended/Search/Sort;
- no SQLite/CSV/history DB created;
- Phase 07 platform regression.

PASS ở checkpoint này chưa đóng Phase 08. Real multi-session manual acceptance, long-running tracker cadence và selected-session detail aggregation vẫn còn phải hoàn thiện.
