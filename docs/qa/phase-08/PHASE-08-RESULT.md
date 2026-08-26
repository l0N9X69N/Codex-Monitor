# Phase 08 — Result

## Trạng thái

**ACTIVE — automated core checkpoints PASS; manual multi-terminal/performance acceptance pending.**

## Đã làm

- `src/manager/session-core.js` làm core mới cho Manager.
- `SessionActivityResolver`: `LIVE / ENDED / UNKNOWN`, không dùng mtime-only để claim LIVE.
- Metadata-first discovery, không full-read/deep parse body hàng loạt.
- Bounded identity enrichment cho thread/cwd/project/model.
- Conservative process/session correlation bằng strong identity evidence.
- Long-running tracker tách cadence discovery/process/known-refresh/selected-tail.
- Lightweight global row cho state/project/model/elapsed/tokens/context/turn/tool/last activity/error/retry/compaction/file size.
- Lightweight bootstrap/tail bounded; incomplete totals giữ unknown thay vì fabricate.
- Selected-session deep parser tái sử dụng historical parser với provenance `OFFICIAL_HISTORY`.
- Selected detail contract ổn định cho `Info/Tokens/Turns/Tools/Resources/Errors`.
- Incremental selected tail giữ partial-line/no-duplicate/truncate behavior.
- Query model: All/Live/Ended/Search/Sort.
- External delete degrade an toàn.
- `codexm --manager` chạy read-only Manager core và không launch Codex.
- `--history` không còn Monitor-owned semantics.
- `npm run verify:phase8` PASS trên local Windows checkout theo báo cáo người dùng.

## Exit gate còn lại

- chạy Manager cùng 2–3 Codex terminals thật;
- xác nhận từng session LIVE/ENDED hợp lý và independent;
- đóng một Codex rồi quan sát transition;
- session folder lớn vẫn khởi động/chạy ổn;
- selected detail hoạt động nhưng non-selected session không gây CPU/I/O cao;
- P0 = 0.

Manager TUI/charts là Phase 09, không chặn Phase 08.

Phase 08 chỉ chuyển CLOSED sau khi manual gate trên PASS.
