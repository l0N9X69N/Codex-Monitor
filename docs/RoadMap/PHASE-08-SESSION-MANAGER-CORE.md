# Phase 08 — Session Manager Core

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor v1 implementation baseline, frozen 2026-08-25.

## Spec liên quan

Sections 2.2–3, 16, 21–25, 27–28, 31, 33, 37–42.

## Mục tiêu

Xây data/runtime core cho `codexm --manager` — một process độc lập, không launch Codex, nhìn được tất cả local Codex sessions và theo dõi nhiều session LIVE cùng lúc bằng local evidence.

## CLI contract

Canonical:

```powershell
codexm --manager
```

Phase này phải loại hoàn toàn public `--history` semantics cũ. Historical sessions là các session `ENDED` bên trong Manager.

## Phạm vi phải làm

### Session discovery

- source of truth: `~/.codex/sessions/**/*.jsonl` hoặc platform-equivalent Codex sessions path;
- startup discovery metadata-first;
- RAM-only index/cache;
- không SQLite/CSV/history DB mặc định;
- thousands-session discovery không deep parse mọi file.

### SessionActivityResolver

Không dùng mtime-only để claim LIVE.

Kết hợp evidence mạnh nhất có thể:

```text
Codex process existence
JSONL growth after observation
session metadata
cwd/session/process mapping
```

States tối thiểu:

```text
LIVE
ENDED
UNKNOWN/RECENT nếu evidence chưa đủ
```

Không confidently claim LIVE khi evidence yếu.

### Multi-LIVE lightweight tracking

Global Manager level chỉ tail/aggregate đủ cho dữ liệu đang hiển thị:

```text
state
project/cwd
model when evidenced
elapsed
tokens/context
turn count
tool count
last activity
recent errors/retries/compactions
file size
```

Không deep-parse continuously mọi session.

### Selected-session deep parser

Khi user chọn một session:

```text
selected session -> detail aggregation ON
leave session     -> detail-only work sleeps/releases
```

Historical model phải tách provenance khỏi current Live Monitor state.

### Query/view model

Core phải support cho UI Phase 09:

```text
All
Live
Ended
Search
Filter
Sort
Selected row
```

Không hard-code terminal rendering vào discovery/parser layer.

### Incremental tail

- track byte offset/size;
- partial line safe;
- append only parse new bytes;
- no duplicate events;
- truncate/rotation reload safely;
- external delete/permission errors degrade gracefully.

### Historical truth

- missing = `--`;
- không scan filesystem hiện tại rồi gán resources ngược cho old session;
- no pricing/cost;
- no historical machine telemetry invented by Monitor.

## Không làm trong Phase 08

- Chưa làm cyber dashboard hoàn chỉnh.
- Chưa làm chart rendering.
- Chưa delete session.
- Chưa generic process manager.
- Chưa automatic retention/cleanup.

## Auto test bắt buộc

- `--manager` không spawn Codex;
- `--history` không còn là Monitor feature;
- 1000+ fake sessions metadata discovery không deep parse;
- LIVE/ENDED resolver không dùng mtime-only;
- multiple growing sessions update independently;
- selected session deep parse only;
- partial append/no duplicate/truncate/external delete;
- search/filter/sort model deterministic;
- no DB/CSV created;
- historical resources evidence-only;
- malformed lines/files do not crash Manager core.

## Manual test bắt buộc

- mở Manager cùng 2–3 Codex terminals thật;
- xác nhận từng session LIVE/ENDED hợp lý;
- đóng một Codex và quan sát transition;
- folder sessions thật lớn vẫn mở nhanh;
- selected session có detail, non-selected session không gây CPU/I/O cao.

## Deliverables

```text
docs/qa/phase-08/PHASE-08-RESULT.md
docs/qa/phase-08/AUTO-TEST-REPORT.md
docs/qa/phase-08/MANUAL-TEST-REQUIRED.md
docs/qa/phase-08/KNOWN-ISSUES.md
```

## Exit gate

Manager core đọc/tail/classify sessions đúng, multi-LIVE lightweight, no duplicate DB, P0=0.

## Trạng thái hiện tại

```text
NOT STARTED — old History implementation is not accepted as Phase 08 completion
```
