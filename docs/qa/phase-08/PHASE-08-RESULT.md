# Phase 08 — Result

## Trạng thái

**ACTIVE — first Session Manager core checkpoint implemented, verification pending.**

## Đã làm

- `src/manager/session-core.js` làm core mới cho Manager.
- `SessionActivityResolver`: `LIVE / ENDED / UNKNOWN`, không dùng mtime-only để claim LIVE.
- Metadata-first discovery, không deep parse body hàng loạt.
- Selected-session deep parser tái sử dụng historical parser với provenance `OFFICIAL_HISTORY`.
- Incremental selected tail giữ partial-line/no-duplicate/truncate behavior.
- Query model: All/Live/Ended/Search/Sort.
- External delete degrade an toàn.
- `codexm --manager` chạy read-only Manager core và không launch Codex.
- `--history` không còn Monitor-owned semantics.
- Có `npm run verify:phase8`.

## Chưa hoàn tất

- bounded identity enrichment cho global rows;
- process/session correlation đủ mạnh cho mixed multi-LIVE/mixed ENDED cases;
- long-running lightweight tracker/cadence/backoff;
- real 2–3 concurrent Codex manual acceptance;
- Manager TUI/charts (Phase 09).

Phase 08 không được đánh dấu CLOSED cho tới khi các core/multi-session manual gates hoàn tất.
