# Phase 08 — Session Manager Core

> **Nguồn chuẩn:** `PROJECT-SPEC.md` v1.1 — Phase 07 closed, Phase 08 active.

## Trạng thái

```text
ACTIVE — 2026-08-26
```

## Mục tiêu

Xây data/runtime core cho `codexm --manager` — process độc lập, không launch Codex, nhìn local Codex sessions và theo dõi nhiều session bằng local evidence.

## CLI contract

```powershell
codexm --manager
```

`--history` không phải Monitor-owned feature. Historical sessions là `ENDED` bên trong Manager; `--history` được forward cho official Codex.

## Core architecture

```text
~/.codex/sessions/**/*.jsonl
            │
            ▼
 metadata-first discovery
            │
            ▼
 SessionManagerCore
 ├── SessionActivityResolver
 ├── query: All/Live/Ended/Search/Sort
 ├── lightweight global metadata
 └── selected session
          │
          ▼
 legacy HistoryEngine parser reused only as deep parser
```

`src/history/` là scaffold/parser cũ. Nó không còn định nghĩa public History product semantics.

## Đã hoàn tất ở checkpoint đầu

- Tạo `src/manager/session-core.js`.
- Tạo `SessionActivityResolver` với states `LIVE/ENDED/UNKNOWN`.
- mtime-only không bao giờ đủ để claim LIVE.
- File growth hoặc process match là strong LIVE evidence.
- Strong LIVE evidence có grace window, không rơi UNKNOWN ngay ở poll không có append.
- Metadata discovery không deep parse body session.
- Query model hỗ trợ All/Live/Ended/Search/Sort deterministic.
- Chỉ session được chọn mới deep parse bằng historical parser.
- Selected-session incremental tail giữ partial-line/no-duplicate/truncate semantics.
- External delete degrade an toàn và clear missing selection.
- `codexm --manager` đã nối vào read-only Manager core và không spawn Codex.
- `--history` test đã đổi sang pass-through semantics đúng spec.
- Thêm `npm run verify:phase8`.

## Việc còn lại của Phase 08

### Lightweight identity enrichment

Global metadata hiện cố ý không deep parse. Cần thêm bounded/shallow identity enrichment để lấy đủ evidence an toàn cho:

```text
thread id
cwd/project
model when cheaply evidenced
```

Không được biến startup thành full parse hàng nghìn file.

### Process/session correlation

Kết hợp process tree + cwd/session evidence để LIVE/ENDED mạnh hơn file-growth-only.

Không dùng mtime-only.

### Multi-session tracking loop

- incremental observation nhiều growing sessions;
- no duplicate work;
- bounded cadence/backoff;
- non-selected session không deep aggregate;
- selected session tail riêng.

### Historical summary model

Global row cần đủ lightweight facts cho Phase 09:

```text
state
project/cwd
model when evidenced
elapsed/context/tokens summary when cheaply available
turn/tool/error/compaction counters
last activity
file size
```

Không manufacture unsupported values.

## Không làm trong Phase 08

- Chưa làm cyber dashboard hoàn chỉnh.
- Chưa làm chart rendering.
- Chưa delete session.
- Chưa generic process manager.
- Chưa automatic retention/cleanup.
- Chưa first-install onboarding UI; phần đó đã nằm trong product/config UX roadmap/spec.

## Auto test bắt buộc

- `--manager` không spawn Codex;
- `--history` không còn là Monitor feature;
- 1000+ fake sessions discovery không deep parse;
- LIVE resolver không dùng mtime-only;
- strong LIVE evidence giữ hợp lý qua idle poll;
- multiple growing sessions update independently;
- selected session deep parse only;
- partial append/no duplicate/truncate/external delete;
- search/filter/sort deterministic;
- no DB/CSV created;
- historical resources evidence-only;
- malformed lines/files không crash Manager core.

Run:

```powershell
npm run verify:phase8
```

## Manual test cuối phase

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

Manager core discover/tail/classify sessions đúng, multi-LIVE lightweight, selected-only deep parse, no duplicate DB, P0=0.
