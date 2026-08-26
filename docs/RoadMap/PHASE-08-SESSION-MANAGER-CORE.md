# Phase 08 — Session Manager Core

> **Nguồn chuẩn:** `PROJECT-SPEC.md` v1.1 — Phase 07 closed, Phase 08 closed.

## Trạng thái

```text
CLOSED — 2026-08-26
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

## Hoàn tất

- `SessionActivityResolver` với states `LIVE/ENDED/UNKNOWN`; mtime-only không claim LIVE.
- File growth/process match là strong LIVE evidence với grace window hợp lý.
- Persistent renderer-neutral Manager runtime; `codexm --manager` chạy liên tục tới khi stop và không launch Codex.
- Windows process-family detection + one-to-one nearest-start correlation + sticky association + mapped-root disappearance evidence.
- Dynamic discovery/remap cho Codex sessions mở sau khi Manager đã chạy.
- Metadata-first discovery không deep parse body hàng loạt.
- Bounded shallow identity enrichment cho thread/cwd/project/model.
- Failed/empty identity probe không lặp lại nếu file không đổi size.
- Fast known-session refresh bounded vào recent/active/missing/selected set; full discovery chạy cadence chậm hơn.
- Lightweight global summary model cho state/project/model/elapsed/tokens/context/turn/tool/last activity/error/retry/compaction/file size.
- Bounded lightweight bootstrap/tail; incomplete totals giữ unknown thay vì fabricate.
- Chỉ selected session mới deep parse/tail; đổi/bỏ selection nhả deep cache cũ.
- Partial append/no duplicate/truncate/external delete degrade an toàn.
- Query All/Live/Ended/Search/Sort deterministic.
- Không tạo SQLite/CSV/history DB.

## Không làm trong Phase 08

- Interactive cyber dashboard/TUI hoàn chỉnh — Phase 09.
- Chart rendering — Phase 10.
- Delete/archive/storage mutation — Phase 11.
- Generic process manager.
- Automatic retention/cleanup.
- First-install onboarding UI.

## Verification

```powershell
npm run verify:phase8
```

Final local Windows verification: **PASS** sau các fix persistent runtime, process correlation, bounded identity I/O và bounded fast refresh.

Automated coverage gồm 1000+ synthetic sessions, selected-only deep parse, bounded `openSync/readSync`, bounded fast stat refresh, resolver/process regressions, lightweight summary semantics, malformed/truncate/delete safety và Phase 07 regression.

## Manual acceptance

Real Windows Session Manager đã PASS:

- multi-session LIVE độc lập;
- sticky process association qua poll;
- đóng một Codex làm đúng mapped session rời LIVE rồi thành ENDED trong khi session còn lại vẫn LIVE;
- session mới mở trong lúc Manager đang chạy được discover/remap và chuyển LIVE;
- đóng session mới tiếp tục tạo specific missing evidence/ENDED transition.

Các performance/I/O properties khó đánh giá bằng mắt được khóa bằng deterministic automated instrumentation.

## Deliverables

```text
docs/qa/phase-08/PHASE-08-RESULT.md
docs/qa/phase-08/AUTO-TEST-REPORT.md
docs/qa/phase-08/MANUAL-TEST-REQUIRED.md
docs/qa/phase-08/KNOWN-ISSUES.md
```

## Exit gate

- discover/tail/classify sessions đúng: PASS
- persistent multi-LIVE lightweight tracking: PASS
- selected-only deep parse: PASS
- bounded startup/runtime I/O: PASS
- no duplicate DB: PASS
- P0 = 0

**Phase 08 CLOSED. Next: Phase 09 — Session Manager UI.**
