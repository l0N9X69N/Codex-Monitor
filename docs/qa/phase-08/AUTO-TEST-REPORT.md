# Phase 08 — Auto Test Report

## Trạng thái

**PASS — final local Windows verification reported on 2026-08-26 after bounded runtime-I/O fixes.**

Run used:

```powershell
npm run verify:phase8
```

Coverage cuối phase:

- `--manager` là Monitor-owned và không spawn Codex;
- `--history` được forward cho official Codex;
- persistent Session Manager runtime stays alive until stop;
- process association persists across polls;
- mapped root disappearance becomes session-specific negative evidence;
- nearest-start correlation remains one-to-one and exact thread evidence wins;
- Windows process tree collection remains lightweight enough for correlation;
- 1000+ session discovery không full-read/deep-parse session bodies;
- identity probing bị giới hạn vào recent set;
- unchanged empty/malformed identity probes không bị reopen mỗi fast refresh;
- fast known-session refresh không stat toàn bộ 1000+ session set;
- full discovery cadence vẫn giữ eventual truth;
- mtime-only không claim LIVE;
- file growth/process match là strong LIVE evidence;
- process telemetry unavailable không fabricate ENDED;
- multiple growing sessions update independently;
- selected session mới deep parse/tail;
- non-selected sessions không trigger additional deep reads;
- release/chuyển selection nhả deep-cache cũ;
- selected detail có contract ổn định cho `Info/Tokens/Turns/Tools/Resources/Errors`;
- missing historical values giữ `null`/unknown, không fabricate cost/system resources;
- lightweight global row có state/project/model/elapsed/tokens/context/turn/tool/last activity/error/retry/compaction/file size;
- lightweight bootstrap/incremental tail đều bounded;
- incomplete turn/tool totals giữ unknown thay vì fabricate;
- append không duplicate, large observation gap degrade về unknown;
- truncate/external delete degrade an toàn;
- deterministic All/Live/Ended/Search/Sort;
- no SQLite/CSV/history DB created;
- Phase 07 platform regression.

Final automated checkpoint: **PASS**.
