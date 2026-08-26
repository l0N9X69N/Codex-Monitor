# Phase 08 — Auto Test Report

## Trạng thái

**WAITING USER RUN — new Session Manager core checkpoint**

Run:

```powershell
npm run verify:phase8
```

Coverage hiện tại:

- `--manager` là Monitor-owned và không spawn Codex;
- `--history` được forward cho official Codex;
- 1000+ session metadata discovery không deep parse;
- mtime-only không claim LIVE;
- file growth/process-match là strong LIVE evidence;
- multi-session growth độc lập;
- selected-session-only deep parse;
- historical provenance;
- partial append/no duplicate/truncate/external delete;
- deterministic All/Live/Ended/Search/Sort;
- no SQLite/CSV/history DB created;
- Phase 07 platform regression.

PASS ở checkpoint này chưa đóng Phase 08. Real multi-session LIVE/ENDED correlation và performance manual gate vẫn còn phải làm.
