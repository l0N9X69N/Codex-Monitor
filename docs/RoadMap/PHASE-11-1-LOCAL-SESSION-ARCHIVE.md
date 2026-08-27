# Phase 11-1 — Local Session Archive

> **Sub-phase bổ sung cho Phase 11.**
>
> File này không thay đổi, không vô hiệu hóa và không mở rộng scope đang được thực thi trong `PHASE-11-SESSION-STORAGE-DELETE-SAFETY-QA.md`.
>
> Phase 11-1 được thêm để xây một backend archive/index local cho Session Manager sau khi nhu cầu thực tế cho thấy việc chỉ parse trực tiếp `~/.codex/sessions/**/*.jsonl` sẽ không còn phù hợp khi lịch sử lớn.

## 1. Mục tiêu

Bổ sung **Local Session Archive** dùng SQLite để:

- mở `codexm --manager` nhanh khi có nhiều session hoặc JSONL rất lớn;
- tránh parse lại dữ liệu JSONL đã xử lý;
- giảm RAM/CPU của Manager khi search/filter/sort/chart history;
- index session dần trong lúc Codex đang hoạt động, không đợi tới khi Manager được mở;
- giữ technical analytics lâu hơn vòng đời của raw Codex JSONL;
- vẫn hỗ trợ realtime LIVE session mà không đưa SQLite vào critical realtime path.

Local Session Archive là **technical analytics archive**, không phải conversation memory.

Không thêm model call, embedding, semantic memory, vector database hay transcript injection.

---

## 2. Product boundary

Live Monitor hiện tại không được đổi kiến trúc chỉ để phục vụ archive.

```text
codexm
├── official Codex PTY
├── passive Live HUD
├── current-run telemetry
└── Companion nếu được bật
```

Live Monitor không phụ thuộc SQLite và không chờ Archive Service.

Nếu Archive Service/SQLite lỗi:

```text
Official Codex     unaffected
codexm Live HUD    unaffected
Manager realtime   phải có fallback
Archive freshness  có thể stale cho tới lần reconcile tiếp theo
```

Hard rule:

> Archive work must never block Codex stdin, PTY output, terminal resize/restore, or Live rendering.

---

## 3. Kiến trúc tổng thể

```text
                         OFFICIAL CODEX
                              │
                 ┌────────────┴────────────┐
                 │                         │
              Hooks                 session JSONL
                 │               ~/.codex/sessions
                 │                         │
                 └────────────┬────────────┘
                              ▼
                     ARCHIVE SERVICE
                              │
                     incremental tail
                              │
                     normalized events
                              │
                       batch writer
                              │
                              ▼
                    local SQLite archive
                              │
                              ▼
                      codexm --manager
```

Semantics:

```text
Hook    = signal / lifecycle / wake-up
JSONL   = authoritative raw source while available
SQLite  = derived local archive + query index
```

Không copy nguyên JSONL sang SQLite.

---

## 4. Opt-in và quyền ghi

Archive phải là tính năng user-controlled.

Nếu disabled:

```text
Codex archive hooks    OFF / not installed for this feature
Archive Service        OFF
SQLite archive writes  OFF
Manager                JSONL fallback
```

Nếu enabled:

```text
Codex hooks            enabled
Archive Service        allowed to run locally
SQLite archive         enabled
Manager                SQLite-first for history
```

Không được upload archive, telemetry, prompt, project data hay machine data ra network.

Phase 12 chịu trách nhiệm polished onboarding/config UX. Phase 11-1 chỉ cần contract/config đủ để bật/tắt và test được.

---

## 5. Codex Hook integration

Dùng official Codex hook/plugin mechanism khi runtime hỗ trợ.

Các lifecycle signal hữu ích có thể gồm:

```text
SessionStart
UserPromptSubmit
PreToolUse
PostToolUse
PermissionRequest
Stop
```

Không coi hook payload là nguồn duy nhất của analytics.

Hook dùng để:

- xác định/wake session sớm;
- lazy-start Archive Service;
- mapping session/thread chắc hơn khi có evidence;
- báo lifecycle nhanh;
- giúp phát hiện tool/session activity mà không cần polling mạnh.

JSONL reconciliation vẫn là lớp sửa sai/fallback nếu hook bị miss, service restart hoặc hook schema thay đổi.

Hook phải fail-soft. Archive failure không được làm Codex command thất bại.

---

## 6. Archive Service lifecycle

Archive Service là process local nhỏ, độc lập với Manager UI.

Không cần chạy ở OS startup chỉ để chờ Codex.

Preferred lifecycle:

```text
Codex SessionStart hook
        ↓
lazy-start Archive Service nếu chưa có
        ↓
watch/tail active Codex JSONL
        ↓
index incremental
        ↓
không còn active work
        ↓
idle grace / clean shutdown theo implementation đã benchmark
```

Manager cũng có thể start/wake service để reconcile nếu cần.

Service không có:

- AI/model calls;
- HTTP server nếu implementation không thực sự cần;
- cloud sync;
- Chroma/vector DB;
- PTY;
- terminal renderer;
- process-tree telemetry không liên quan;
- high-frequency polling khi filesystem không đổi.

Idle target:

```text
CPU      effectively sleeping
Disk I/O 0 khi không có dữ liệu mới
Network  0
```

Exact idle timeout/cadence phải benchmark, không freeze bằng cảm tính.

---

## 7. Incremental JSONL tail

Không được parse lại phần file đã archive thành công.

Mỗi source file cần ingest state tối thiểu:

```text
session_id
source_path
file identity khi platform hỗ trợ
indexed_offset
file_size
mtime
parser_version
```

Flow:

```text
old indexed_offset = 184,221,849
current file size   = 184,245,120

seek old offset
→ read only appended bytes
→ parse complete JSONL lines
→ commit archive rows + new offset atomically
```

Hard rule:

> Never reparse data already successfully archived unless a deliberate rebuild/schema migration requires it.

Phải xử lý:

- partial last line;
- malformed line;
- file truncated;
- file replaced/rotated;
- external deletion;
- parser/schema version change;
- process crash giữa transaction;
- duplicate filesystem events;
- concurrent file growth trong lúc đọc.

Không advance committed offset vượt qua dữ liệu chưa parse/commit thành công.

---

## 8. SQLite archive

SQLite là local technical archive, không phải bản sao transcript.

Recommended pragmas để benchmark/xác nhận:

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
```

Cần có busy timeout/retry/backoff và write transaction ngắn.

Không write một transaction cho từng token/event nếu có thể batch an toàn.

Suggested logical tables:

```text
sessions
turns
token_snapshots
tool_events
session_events
resource_usage
ingest_state
schema_migrations
```

### sessions

Có thể chứa:

```text
session_id
source_path
project
cwd
model
reasoning
started_at
ended_at
last_activity_at
status
input_tokens
cached_tokens
output_tokens
reasoning_tokens
turn_count
tool_count
error_count
retry_count
compaction_count
context_current
context_peak
raw_file_size
raw_file_mtime
```

### turns

Có thể chứa:

```text
session_id
turn_no
started_at
duration_ms
input_tokens
cached_tokens
output_tokens
reasoning_tokens
context_used
tool_count
```

### tool_events

Chỉ lưu metadata cần cho Manager. Không mặc định lưu full tool output.

### session_events

Ví dụ:

```text
compaction
retry
error
model_change
session_end
```

### resource_usage

Chỉ lưu khi rollout có evidence đáng tin cậy. Không infer historical resource từ filesystem hiện tại.

---

## 9. Privacy / data minimization

Default archive không lưu:

```text
raw user prompts
assistant responses
full tool output
file contents
terminal transcript
complete JSONL copies
secrets/credentials
```

Nếu metadata field có khả năng chứa secret, phải sanitize hoặc không persist.

Không cần FTS5 trong v1 nếu Manager chỉ search/filter metadata.

Content search trên prompt/response nếu có trong tương lai phải là feature privacy riêng, explicit opt-in; không được âm thầm mở rộng archive schema.

---

## 10. Long-term archive semantics

Khi raw JSONL còn tồn tại:

> JSONL là authoritative raw source; SQLite là derived archive/index.

Khi raw JSONL đã bị user/Codex/external process xóa nhưng archived telemetry vẫn còn:

> SQLite trở thành preserved derived evidence cho technical analytics đã được ingest trước đó.

Manager phải biểu diễn nguồn rõ ràng, không giả rằng raw source vẫn tồn tại.

Session state:

```text
● LIVE
  raw JSONL active
  archive updating

○ ENDED
  raw JSONL exists
  archive available

◇ ARCHIVED
  raw JSONL unavailable
  archived technical analytics remains
```

ARCHIVED session có thể vẫn hiển thị những field đã persist:

```text
Info
Tokens
Turns
Tools
Resources
Errors
Charts
```

Field cần raw source nhưng không được archive phải hiện `--` / `Source unavailable`, không suy đoán.

---

## 11. Manager read path

Historical path:

```text
ENDED / ARCHIVED
      ↓
    SQLite
      ↓
 Session Manager
```

LIVE path không được ép qua SQLite batch delay:

```text
SQLite snapshot
      +
current JSONL delta/tail
      ↓
Manager realtime state
```

Nguyên tắc:

> SQLite for query speed. JSONL tail for realtime freshness.

Dashboard/history operations phù hợp với SQLite:

```text
session list
pagination
search/filter/sort
historical aggregates
storage summaries
chart source data đã archive
```

LIVE overlay phù hợp với incremental tail:

```text
current context
current tokens
turn changes
tool activity
errors/retries
compaction
last activity
```

Không load toàn bộ archive DB thành JS object graph.

---

## 12. Multiple Codex sessions / concurrency

Phải hỗ trợ nhiều session Codex cùng lúc.

```text
Codex A ─┐
Codex B ─┼─→ JSONL append / hooks → Archive Service → SQLite WAL
Codex C ─┘
                                              ↑
                                         Manager reads
```

Preferred v1: một Archive Service làm single coordinated writer thay vì để nhiều `codexm` process tranh write DB, nếu benchmark/implementation cho thấy đơn giản và ổn định hơn.

Nếu implementation cuối cùng cho phép multi-writer, phải có short transactions, busy timeout và backoff; SQLite contention không bao giờ được propagate thành Codex latency.

---

## 13. Storage / deletion interaction

Phase 11 hiện tại vẫn sở hữu destructive delete safety của raw Codex session files.

Phase 11-1 bổ sung semantics archive:

```text
Delete Codex Session
→ xóa raw JSONL theo Phase 11 safety rules
→ archived analytics có thể được giữ

Delete Archive Data
→ xóa Monitor-owned SQLite analytics
→ không được xóa Codex JSONL
```

Nếu raw delete thất bại, không được giả rằng source đã bị xóa.

Nếu raw JSONL bị xóa external, reconciliation chuyển session sang ARCHIVED nếu telemetry archive còn tồn tại.

Default long-term behavior:

```text
Archive retention  Forever
Automatic cleanup  Off
```

Không auto-delete analytics nếu user chưa chọn policy rõ ràng.

---

## 14. Rebuild / clear / corruption

Manager/diagnostics cần có semantics rõ ràng:

```text
Reconcile Archive
Rebuild Indexable Data
Clear Archive
Disable Archive
```

`Clear Archive` chỉ xóa Monitor-owned archive data, không chạm `~/.codex/sessions`.

Vì archive có thể giữ analytics của JSONL đã không còn tồn tại, **full rebuild từ raw JSONL có thể không khôi phục toàn bộ ARCHIVED history**.

Do đó UI/docs không được gọi toàn bộ SQLite archive là "disposable cache" sau khi long-term archive được bật.

Cần phân biệt:

```text
rebuildable indexed data
preserved archive-only analytics
```

Migration/corruption handling phải ưu tiên không phá phần archive-only còn hợp lệ.

---

## 15. Cross-platform

Windows/Linux/macOS giữ cùng product semantics.

OS-specific implementation nằm sau platform/service abstraction.

Phải test tối thiểu:

- filesystem watching;
- recursive session discovery;
- path normalization;
- file identity/truncation detection;
- process/service lifecycle;
- SQLite packaging/native dependency behavior;
- uninstall cleanup.

Không assume Bun chỉ vì reference project dùng Bun.

Codex Monitor hiện target Node; lựa chọn SQLite package/runtime phải phù hợp packaging và Node support policy của project.

---

## 16. Installation / uninstall

Khi Archive enabled, installer/config layer có thể cần:

```text
install Codex hook/plugin integration
create Monitor archive directory
initialize/migrate SQLite
register settings
```

Không được thay đổi official Codex binary.

Uninstall Codex Monitor:

- remove Monitor-owned hook/plugin integration;
- stop/remove Archive Service components;
- không xóa official Codex;
- không xóa Codex auth;
- không xóa raw Codex sessions;
- archive DB deletion phải explicit hoặc được giải thích rõ cho user.

---

## 17. Performance requirements

Archive priority thấp hơn Live work.

```text
1. Codex PTY/input
2. terminal correctness/restore
3. current-session Live state
4. visible Live/Manager realtime UI
5. archive ingestion
6. archive maintenance/rebuild
```

Phải benchmark:

```text
idle CPU
idle RAM
active CPU
active RAM
write IOPS
DB growth per session
first import cost
incremental append cost
Manager cold-open time
Manager search/filter latency
10 / 100 / 1,000 / 10,000 session scale nếu fixture cho phép
multiple simultaneous LIVE sessions
```

First backfill có thể tốn I/O/CPU; phải chạy bounded, yield event loop và có progress thay vì saturate máy.

---

## 18. Failure model

Bắt buộc fail-soft:

```text
SQLite locked
→ queue/defer/retry

Archive Service crash
→ Codex unaffected

Hook failure
→ Codex unaffected; JSONL reconcile later

DB unavailable
→ Manager fallback JSONL where possible

DB stale
→ show freshness/reconcile; do not fabricate

Malformed JSONL
→ isolate/report; do not corrupt unrelated sessions
```

Archive freshness phải có provenance đủ để Manager không trình bày stale data như realtime truth.

---

## 19. Auto test bắt buộc

- hook failure does not fail Codex path;
- lazy service start/wake;
- incremental offset resume;
- partial JSONL last line;
- duplicate fs events do not duplicate rows;
- truncate/replace recovery;
- atomic data + offset commit;
- service crash/restart catch-up;
- SQLite busy/locked retry;
- multi-session ingest;
- Manager historical SELECT/pagination;
- LIVE SQLite snapshot + JSONL delta correctness;
- raw JSONL external deletion → ARCHIVED;
- ARCHIVED analytics remains queryable;
- Clear Archive never deletes raw Codex files;
- raw delete can preserve archive;
- no prompt/response/tool-output persistence by default;
- zero archive network requests;
- disabled archive means zero Archive Service activity;
- terminal/PTY regression suite remains green.

---

## 20. Manual QA

Dùng temp/fake sessions trước.

Scenarios:

```text
1. Enable archive → run Codex → never open Manager → end session → open Manager later.
2. Grow one JSONL to large size → verify only appended bytes are consumed after stored offset.
3. Run multiple Codex sessions simultaneously.
4. Restart Archive Service mid-session.
5. Keep Manager closed for long period, then open; history should already be indexed.
6. Delete one raw ENDED JSONL while keeping archive → session becomes ARCHIVED.
7. Disable archive → verify no service/write activity.
8. Re-enable → reconcile changed/new JSONLs.
9. Simulate locked/corrupt/stale DB using disposable fixture only.
10. Verify Live Codex latency/input behavior unchanged with archive enabled vs disabled.
```

Không destructive-test lần đầu trên important real sessions.

---

## 21. Deliverables

Implementation deliverables dự kiến:

```text
archive service lifecycle
Codex hook integration
JSONL watcher/tailer
incremental ingest state
SQLite schema + migrations
batch writer
Manager archive repository/query layer
LIVE overlay/reconciliation
archive config contract
storage/archive semantics
```

QA deliverables:

```text
docs/qa/phase-11-1/AUTO-TEST-REPORT.md
docs/qa/phase-11-1/MANUAL-TEST-REQUIRED.md
docs/qa/phase-11-1/KNOWN-ISSUES.md
docs/qa/phase-11-1/PHASE-11-1-RESULT.md
```

---

## 22. Exit gate

Phase 11-1 chỉ được close khi:

```text
✓ Codex/Live path không phụ thuộc SQLite
✓ hooks fail-soft
✓ Archive Service không chạy khi feature disabled
✓ large JSONL không bị reparse từ đầu sau khi offset đã commit
✓ multiple sessions ingest ổn định
✓ Manager history đọc SQLite nhanh và bounded-memory
✓ LIVE realtime không phụ thuộc batch SQLite latency
✓ ARCHIVED session giữ được persisted analytics khi raw JSONL mất
✓ default archive không lưu conversation transcript/content
✓ no archive network traffic
✓ clear/delete semantics không thể nhầm raw Codex data với Monitor archive
✓ Windows verified
✓ Linux/macOS giữ explicit verification status theo project policy
✓ performance/stress regression gate PASS
```

---

## 23. Trạng thái hiện tại

```text
PLANNED — supplemental sub-phase; Phase 11 hiện tại tiếp tục độc lập
```

Implementation của Phase 11-1 không được bắt đầu bằng cách sửa scope giữa chừng của file Phase 11 hiện tại. Khi cần integration cuối, thực hiện qua contract rõ ràng và QA regression thay vì silently rewriting Phase 11.
