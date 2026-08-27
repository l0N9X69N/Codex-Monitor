# Phase 11-1 — Local Session Archive

> **Sub-phase bổ sung cho Phase 11.**
>
> File này không thay đổi, không vô hiệu hóa và không mở rộng scope đang được thực thi trong `PHASE-11-SESSION-STORAGE-DELETE-SAFETY-QA.md`.
>
> Phase 11-1 được thêm để xây một backend archive/index local cho Session Manager sau khi nhu cầu thực tế cho thấy việc chỉ parse trực tiếp `~/.codex/sessions/**/*.jsonl` sẽ không còn phù hợp khi lịch sử lớn.

**Decision update:** 2026-08-27  
**Status:** PLANNED — supplemental sub-phase; Phase 11 hiện tại tiếp tục độc lập.

---

## 1. Mục tiêu

Bổ sung **Local Session Archive** dùng SQLite để:

- mở `codexm --manager` nhanh khi có nhiều session hoặc JSONL rất lớn;
- tránh parse lại dữ liệu JSONL đã xử lý;
- giảm RAM/CPU của Manager khi search/filter/sort/chart history;
- index session dần trong lúc Codex đang hoạt động, kể cả khi Manager không mở;
- giữ technical analytics lâu hơn vòng đời của raw Codex JSONL;
- vẫn hỗ trợ realtime LIVE session mà không đưa SQLite vào critical realtime path;
- cho user quản lý archive, storage và các cấu hình Monitor ngay trong Manager qua một màn Config riêng.

Local Session Archive là **technical analytics archive**, không phải conversation memory.

Không thêm model call, embedding, semantic memory, vector database, transcript injection hay remote telemetry.

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
Manager realtime   fallback/reconcile
Archive freshness  có thể stale cho tới lần reconcile tiếp theo
```

Hard rule:

> Archive work must never block Codex stdin, PTY output, terminal resize/restore, or Live rendering.

Priority:

```text
1. Codex PTY/input
2. terminal correctness/restore
3. current-session Live state
4. visible Live/Manager realtime UI
5. archive ingestion
6. archive maintenance/backfill/compact
```

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
                  watch / reconcile / tail
                              │
                     normalized events
                              │
                       batch writer
                              │
                              ▼
                    local SQLite archive
                              │
                 ┌────────────┴────────────┐
                 │                         │
          historical queries         live overlay
                 │                         │
                 └────────────┬────────────┘
                              ▼
                      codexm --manager
```

Semantics:

```text
Hook       = wake-up signal / lifecycle hint
fs.watch   = wake-up signal
JSONL      = authoritative raw source while available
Offset     = committed checkpoint
SQLite     = derived local archive + query index
Manager    = SQLite-first + JSONL verification/delta
```

Hard rule mới:

> **Missed signal must never become missed data.**

Hook hoặc filesystem event có thể bị miss; dữ liệu không được phép bị mất vì Manager/Service luôn có recovery reconcile dựa trên JSONL + committed offsets.

---

## 4. Opt-in và nơi cấu hình

Archive là tính năng user-controlled.

User phải có ít nhất hai đường vào cùng một config engine:

```text
codexm --manager
→ C / Config
→ Archive

hoặc

codexm --configure
→ cùng Config UI / cùng config schema
```

`codexm --reset` chỉ có nghĩa **restore Monitor defaults**; không phải cách bắt buộc để vào lại cấu hình.

Nếu Archive disabled:

```text
Codex archive hooks    OFF / removed or disabled for this feature
Archive Service        OFF
SQLite archive writes  OFF
Manager                JSONL direct fallback
```

Nếu Archive enabled:

```text
Codex hooks            installed/enabled nếu runtime hỗ trợ
Archive Service        enabled/lazy-startable
SQLite archive         initialized/migrated
Manager                SQLite-first for history
Reconciliation         enabled
```

Không upload archive, telemetry, prompt, project data hay machine data ra network.

---

## 5. Config UI trong Session Manager

### 5.1 Không thêm Settings thành session tab

Không thêm `Settings` vào:

```text
Info | Tokens | Turns | Tools | Resources | Errors
```

vì đó là detail tabs của một session.

Config là **một màn hình/mode riêng của Manager**.

### 5.2 Entry point từ màn Manager chính

Footer/action của Manager có:

```text
↑↓ Navigate   Enter Open   / Search   S Storage   C Config   Q Quit
```

Bấm `C` mở toàn màn Config:

```text
┌──────────────────── CODEX MONITOR CONFIG ────────────────────┐
│                                                              │
│ Live View | Cards | Fields | Header | Companion | Appearance│
│ Archive   | Manager | Updates                               │
│                                                              │
│             nội dung tab đang chọn                           │
│                                                              │
│ [ Save ]   [ Revert ]                         Esc Back       │
└──────────────────────────────────────────────────────────────┘
```

Đây là TUI interactive của Manager, không liên quan tới nguyên tắc Live Monitor không intercept Codex input.

### 5.3 Config tabs

Canonical tabs:

```text
Live View
Cards
Fields
Header
Companion
Appearance
Archive
Manager
Updates
```

#### Live View

```text
Preset
  Recommended
  Compact
  Full
  Custom

Responsive behavior
System mode
Companion mode
```

#### Cards

```text
Context       On
Usage         On
Session       On
Activity      On
System        Auto
Companion     Auto
```

#### Fields

Cho phép bật/tắt field theo từng card, ví dụ:

```text
CONTEXT
[x] Used %
[x] Used / Window
[x] Left %
[x] Compactions
[ ] Cache

SESSION
[x] Elapsed
[x] Turns
[x] Last turn
[x] Session ID
...
```

Disabled field phải thật sự bỏ collector demand nếu không còn consumer khác.

#### Header

```text
[x] Activity
[x] Model
[x] Project
[x] Git
[ ] Auth
[ ] Health
[ ] Session age

Order:
Activity > Model > Project > Git
```

Cho phép reorder bằng keyboard phù hợp với Manager TUI.

#### Companion

```text
Mode          Off / Auto / Always
Dock          Side / Bottom
Animation     Normal / Reduced
Context body  On / Off
Idle actions  On / Off
```

#### Appearance

```text
Theme         Color / Mono / Matrix
Background    Terminal / Black / Dark
Language      VI / EN
```

#### Manager

Dành cho các preference riêng của Manager như default sort/filter/chart density nếu product cần.

#### Updates

Giữ update-check settings tách khỏi monitoring/network data path.

### 5.4 Save / apply semantics

UI có thể chỉ cần một action `Save`, nhưng backend phân loại side effect.

Live View/Card/Header/Appearance changes:

```text
Save config
→ áp dụng cho lần chạy codexm tiếp theo
```

Không bắt buộc hot-reload một Live Monitor đang chạy ở terminal khác trong v1.

Archive changes:

```text
OFF → ON
→ validate runtime compatibility
→ initialize/migrate DB
→ install/enable hook integration
→ start/wake Archive Service
→ reconcile sources

ON → OFF
→ stop Archive Service
→ disable/remove Monitor-owned archive hook integration
→ giữ SQLite data mặc định
```

Tắt Archive không được tự xóa database.

`Clear Archive` là thao tác riêng có confirm rõ ràng.

### 5.5 Cùng một Config component

Không có hai hệ config khác nhau.

```text
                ConfigController
                     │
          ┌──────────┴──────────┐
          │                     │
codexm --configure        Manager → C
```

Cùng config schema, validation, renderer logic và save logic.

---

## 6. Archive tab UI và health

Archive tab phải vừa cấu hình vừa cho thấy tình trạng thực tế:

```text
LOCAL SESSION ARCHIVE

Archive          ● Enabled
Service          ● Running
Codex Hook       ● Installed
Watcher          ● Active
SQLite           ● Healthy
Sync             ● Ready
Database         184.2 MB
Sessions         3,241
Last reconcile   4s ago
Pending files    0
Pending bytes    0

Retention        Forever
Size limit       Unlimited

[ Reconcile Now ]
[ Compact Archive ]
[ Repair Hook ]
[ Clear Archive ]
```

Nếu hook lỗi nhưng watcher/reconcile còn hoạt động:

```text
Codex Hook       ! Missing
Watcher          ● Active
Sync             ◐ Catching up
```

Không được coi hook lỗi là mất archive nếu JSONL recovery path vẫn làm việc.

Các action destructive phải confirm rõ raw Codex data và Monitor-owned archive data là hai thứ khác nhau.

---

## 7. Codex Hook integration — chống bỏ lọt

Dùng official Codex hook/plugin mechanism khi runtime hỗ trợ.

Các signal hữu ích có thể gồm:

```text
SessionStart
UserPromptSubmit
PreToolUse
PostToolUse
PermissionRequest
Stop
```

Hook dùng để:

- xác định/wake session sớm;
- lazy-start Archive Service;
- mapping session/thread chắc hơn khi có evidence;
- báo lifecycle nhanh;
- wake file reconciliation khi activity xảy ra.

Không coi hook payload là nguồn duy nhất của analytics.

### 7.1 Ba tầng chống bỏ lọt

```text
FAST PATH
Hook / fs.watch
→ wake immediately
→ reconcile changed source

RECOVERY PATH
Service start / wake / Manager open / resume-from-sleep
→ scan source metadata
→ compare source size/identity với ingest_state
→ catch up mọi file bị thiếu

SAFETY PATH
Service đang active
→ low-frequency metadata sweep
→ stat only, không full parse
→ phát hiện missed watcher event/new file
```

Safety cadence phải benchmark/adaptive; không freeze high-frequency polling.

### 7.2 Hook fail-soft

Hook phải return nhanh và fail-open/fail-soft.

Không được để:

```text
hook IPC error
SQLite locked
service unavailable
```

làm Codex prompt/tool execution fail.

### 7.3 Dedupe

Hook, watcher và reconcile có thể cùng đánh thức ingest nhiều lần. Derived events phải có idempotency/dedupe key phù hợp, ví dụ:

```text
session_id
source_path
source_offset hoặc upstream stable event id
event_type
```

SQLite cần UNIQUE constraint/index tương ứng cho event classes có stable identity.

---

## 8. Archive Service lifecycle

Archive Service là process local nhỏ, độc lập với Manager UI.

Preferred behavior:

```text
Codex SessionStart hook
        ↓
lazy-start Archive Service nếu chưa chạy
        ↓
watch/tail active Codex JSONL
        ↓
index incremental
        ↓
không còn active work
        ↓
idle grace / sleep / clean shutdown theo benchmark
```

Manager cũng có thể start/wake service để reconcile.

Service không có:

- AI/model calls;
- cloud sync;
- vector DB;
- terminal renderer;
- PTY ownership;
- remote telemetry;
- process-tree telemetry không liên quan;
- local HTTP server nếu không có lý do IPC bắt buộc.

Nếu IPC cần thiết, ưu tiên local-only mechanism với owner restriction; không expose network listener không cần thiết.

Idle target:

```text
CPU      effectively sleeping
Disk I/O 0 khi không có dữ liệu mới
Network  0
```

---

## 9. Incremental JSONL tail và committed checkpoint

Không parse lại phần file đã archive thành công.

Mỗi source file cần `ingest_state` tối thiểu:

```text
session_id
source_path
file_identity
committed_offset
observed_file_size
source_mtime
parser_version
last_success_at
last_error
```

Flow:

```text
committed_offset  = 184,221,849
current file size = 184,245,120

seek 184,221,849
→ read only appended bytes
→ preserve partial last line
→ parse complete JSONL lines
→ write derived rows
→ update committed_offset
→ COMMIT atomically
```

Hard rule:

> Never advance `committed_offset` beyond data whose derived SQLite state committed successfully.

Nếu process crash:

```text
parsed tới byte 10 MB
SQLite commit mới tới byte 8 MB
process chết
```

lần sau bắt đầu lại từ byte 8 MB. Reparse nhỏ chấp nhận được; mất dữ liệu không chấp nhận được.

Phải xử lý:

- partial last line;
- malformed line;
- file truncated;
- file replaced/rotated;
- external deletion;
- parser/schema version change;
- process crash giữa transaction;
- duplicate filesystem events;
- concurrent file growth trong lúc đọc;
- machine sleep/wake;
- service restart.

---

## 10. Manager startup/read priority

Manager **không chờ parse toàn bộ JSONL rồi mới render**.

Canonical startup:

```text
codexm --manager
      │
      ├─ 1. Open SQLite
      │     ↓
      │   render history/session rows đã archive ngay
      │
      ├─ 2. Scan lightweight source metadata
      │     path / identity / size / mtime only
      │
      ├─ 3. Compare với ingest_state
      │
      ├─ 4. Mark READY / CATCHING_UP / UNINDEXED / STALE / ARCHIVED
      │
      └─ 5. Reconcile missing deltas in background
                    ↓
                UI updates progressively
```

Read priority:

```text
Historical list/search/filter/sort/chart
→ SQLite primary

Source verification / missing data
→ JSONL metadata + incremental delta

LIVE realtime
→ SQLite base snapshot + JSONL tail overlay
```

Hard rule:

> SQLite for query speed. JSONL for verification, catch-up and realtime freshness.

### 10.1 Sync states

Canonical states:

```text
READY
SQLite caught up through the latest verified source high-water mark.

CATCHING_UP
SQLite has useful data but source has uncommitted append bytes.

UNINDEXED
Raw JSONL exists but this source has never been archived.

STALE
File identity/truncation/parser-version mismatch requires reconciliation/rebuild.

ARCHIVED
SQLite analytics exists but raw source no longer exists.
```

LIVE session có thể chuyển liên tục READY-at-high-water-mark ↔ CATCHING_UP khi file append.

### 10.2 READY không dựa vào timestamp mơ hồ

Manager chỉ được hiện `INDEX ● READY` khi:

```text
all known sources:
  committed_offset == latest verified observed size
AND no unindexed source files
AND parser_version current
AND no failed/pending ingest queue
AND source scan completed for current reconciliation generation
```

Không dùng mtime-only để kết luận đủ.

### 10.3 Tránh race ở EOF

Reconcile một active source:

```text
1. attach watcher/tailer
2. stat source → S1
3. compare committed_offset
4. read through S1
5. commit through complete lines
6. stat source again → S2
7. if S2 > committed_offset, continue
8. caught-up only at verified high-water mark
```

Watcher nhận append tiếp theo.

### 10.4 Large unindexed file

JSONL 2 GB chưa index không được block Manager.

Manager có thể render provisional row:

```text
○ INDEXING
Project   --
Model     --
Size      2.0 GB
```

Archive Service import theo bounded chunks/background priority. Các số chưa complete phải có provenance/indexing state, không giả là final.

---

## 11. SQLite: một file, nhiều bảng chuyên biệt

Không nhét tất cả analytics vào một bảng khổng lồ.

Canonical shape:

```text
codexm-archive.sqlite
│
├── sessions
├── turns
├── context_samples
├── tool_events
├── session_events
├── resource_usage
├── ingest_state
├── archive_meta
└── schema_migrations
```

Có thể thêm bảng chuyên biệt sau này nếu benchmark/query yêu cầu, nhưng không copy raw transcript.

Design principle:

> **One SQLite file, normalized detail tables, denormalized session summary for fast dashboard queries.**

---

## 12. SQLite schema chi tiết

### 12.1 `sessions` — summary table

**1 session = 1 row.** Đây là bảng Manager dùng thường xuyên nhất.

Recommended fields:

```text
session_id              PRIMARY KEY
source_path             nullable khi ARCHIVED
project
cwd
model
reasoning
started_at
ended_at
last_activity_at
state                   LIVE / ENDED / ARCHIVED
raw_source_exists
raw_file_size
raw_file_mtime

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

archive_created_at
archive_updated_at
```

Manager dashboard/list không được phải COUNT/SUM hàng triệu child rows để render summary cơ bản.

Archive Service cập nhật aggregate fields incremental cùng ingestion.

Important indexes dự kiến:

```text
(last_activity_at DESC)
(state, last_activity_at DESC)
(project, last_activity_at DESC)
(model)
(started_at)
```

Exact indexes phải benchmark trên query thật.

### 12.2 `turns`

```text
session_id
turn_no
started_at
ended_at
duration_ms
input_tokens
cached_tokens
output_tokens
reasoning_tokens
context_used
tool_count
```

Key/index:

```text
PRIMARY/UNIQUE(session_id, turn_no)
INDEX(session_id, started_at)
```

Dùng cho:

```text
Turns tab
Token I/O per turn
Turn Duration
Cumulative token charts
```

### 12.3 `context_samples`

Không sample theo renderer tick.

Chỉ persist meaningful context changes/events, ví dụ:

```text
session_id
timestamp
turn_no
used_tokens
window_tokens
percent
event_type
source_offset
```

Có thể downsample/coalesce nếu dữ liệu quá dày, nhưng không được làm mất compaction boundary hoặc values cần cho historical chart.

Indexes:

```text
(session_id, timestamp)
(session_id, turn_no)
```

### 12.4 `tool_events`

```text
id
session_id
turn_no
timestamp
tool_type
tool_name
sanitized_detail
status
duration_ms
source_offset / source_event_id
```

Không mặc định persist:

```text
full shell stdout
full tool response
full file content
raw command output chứa secret
```

Indexes:

```text
(session_id, timestamp)
(session_id, turn_no)
(session_id, tool_name)
```

### 12.5 `session_events`

Dùng cho các event sparse nhưng quan trọng:

```text
id
session_id
timestamp
type
turn_no
value_a
value_b
sanitized_metadata
source_offset / source_event_id
```

Types có thể gồm:

```text
compaction
retry
error
model_change
session_end
```

Indexes:

```text
(session_id, timestamp)
(session_id, type, timestamp)
```

### 12.6 `resource_usage`

Chỉ persist nếu rollout có evidence đáng tin cậy.

```text
session_id
resource_type
name
first_used_at
last_used_at
use_count
```

Không infer historical resources từ filesystem hiện tại.

### 12.7 `ingest_state`

Bảng nhỏ nhưng critical:

```text
session_id
source_path
file_identity
committed_offset
observed_file_size
source_mtime
parser_version
last_success_at
last_error
```

Query này quyết định cần đọc bao nhiêu JSONL mới.

### 12.8 `archive_meta`

Global archive health/state:

```text
schema_version
last_successful_reconcile
last_seen_source_scan
reconcile_generation
pending_file_count
pending_byte_count
hook_last_seen_at
watcher_last_seen_at
service_instance_id
archive_created_at
```

Không dùng `hook_last_seen_at` một mình để quyết định freshness; chỉ là health signal.

### 12.9 `schema_migrations`

Track migration version/time/status để upgrade an toàn.

---

## 13. Foreign keys, cascade và delete integrity

Child tables phải liên kết `sessions.session_id` bằng foreign key khi phù hợp.

Archive-only delete của một session nên có semantics:

```sql
DELETE FROM sessions WHERE session_id = ?;
```

với child rows:

```text
turns
context_samples
tool_events
session_events
resource_usage
```

được `ON DELETE CASCADE` trong cùng transaction, thay vì application code delete thủ công từng bảng dễ bỏ sót.

`ingest_state` cần xử lý theo lifecycle source/archive; không được cascade sai khiến một raw source còn tồn tại bị quên reconcile.

Foreign key behavior phải có tests rõ ràng cho:

```text
raw source exists
raw source deleted but archive kept
archive-only delete
full delete
rebuild/reconcile
```

---

## 14. SQLite write strategy

Recommended pragmas để benchmark/xác nhận:

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
```

Cần:

- busy timeout;
- bounded retry/backoff;
- short transactions;
- prepared statements;
- batch writes;
- no transaction-per-token nếu không cần;
- atomic derived rows + committed offset.

Preferred v1 ownership:

> Một Archive Service là coordinated persistent writer; Manager chủ yếu read-only/read-mostly.

Nếu multi-writer cuối cùng được chọn thì phải chứng minh contention không ảnh hưởng Codex/Manager realtime.

---

## 15. Manager data merge cho LIVE

Ví dụ:

```text
SQLite base:
input   1.82M
turns   18
tools   74

JSONL delta after committed_offset:
input   +42K
turns   +1
tools   +3

Manager UI:
input   1.862M
turns   19
tools   77
```

Khi writer commit delta vào SQLite, live overlay phải rebase/collapse để không double-count.

Canonical merge key phải dựa trên committed/source offsets hoặc equivalent stable watermark.

Không dùng timestamps để đoán phần nào đã persist nếu có offset evidence chính xác hơn.

---

## 16. Long-term archive semantics

Khi raw JSONL còn tồn tại:

> JSONL là authoritative raw source; SQLite là derived archive/index.

Khi raw JSONL bị user/Codex/external process xóa nhưng archived telemetry vẫn còn:

> SQLite là preserved derived evidence cho technical analytics đã ingest trước đó.

Canonical session states:

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

ARCHIVED có thể tiếp tục hiển thị dữ liệu đã persist:

```text
Info
Tokens
Turns
Tools
Resources
Errors
Charts
```

Field chưa từng persist mà cần raw JSONL phải hiện:

```text
--
Source unavailable
```

Không suy đoán.

---

## 17. Storage và ba mức delete

Raw Codex JSONL và Monitor SQLite archive phải tách rõ.

Canonical actions:

```text
Delete Raw
→ xóa Codex session file theo Phase 11 safety rules
→ giữ archived analytics
→ ENDED có thể thành ARCHIVED

Delete Archive
→ xóa Monitor-owned SQLite analytics
→ không đụng raw Codex JSONL

Delete Everything
→ xóa raw Codex session + archived analytics
→ session biến mất hoàn toàn nếu cả hai thành công
```

Free-space dialog nên cho thấy ước lượng riêng:

```text
Raw Codex JSONL        312.4 MB
Archived analytics       1.8 MB

[x] Delete Codex session file
[ ] Delete archived analytics too

Estimated reclaim: ~312.4 MB
```

Mặc định ưu tiên giữ archive analytics khi user chỉ muốn giải phóng raw storage, trừ khi UX/product decision sau đó đổi explicit default.

Nếu raw delete fail, không được xóa archive rồi giả full success.

---

## 18. Archive growth, retention và cleanup

Archive có thể tăng lâu dài nên phải quản lý được, nhưng không auto-delete âm thầm.

Default:

```text
Archive retention  Forever
Automatic cleanup  Off
Size limit         Unlimited
```

Optional user-selected policies có thể gồm:

```text
Retention
  Forever
  1 year
  6 months
  3 months
  Custom

Maximum archive size
  Unlimited
  1 GB
  500 MB
  Custom
```

Nếu user bật policy giới hạn, pruning priority nên conservative:

```text
oldest ARCHIVED
↓
oldest ENDED nếu policy explicit cho phép
↓
never LIVE
```

User phải biết analytics nào sẽ mất.

Không xóa archive-only history chỉ để thỏa một policy mà user chưa chủ động bật.

---

## 19. SQLite file reclaim / compact

`DELETE` rows không đảm bảo file `.sqlite` nhỏ lại ngay. Free pages có thể được SQLite reuse cho dữ liệu mới.

Không chạy full `VACUUM` sau mỗi delete.

Preferred strategy cần benchmark:

```text
DELETE rows
→ free pages reusable internally
→ no immediate heavy VACUUM

khi user yêu cầu / idle maintenance phù hợp
→ Compact Archive
```

Có thể đánh giá từ lúc khởi tạo DB:

```sql
PRAGMA auto_vacuum=INCREMENTAL;
```

nếu test xác nhận trade-off tốt cho workload này.

`Compact Archive` có thể dùng incremental vacuum hoặc full vacuum tùy state/size, nhưng phải:

- không block Codex;
- không chạy trên critical UI path;
- báo progress nếu dài;
- kiểm tra free disk requirement nếu full VACUUM cần temporary space;
- có cancel/fail-safe phù hợp.

Archive tab nên hiển thị tối thiểu:

```text
Database file size
Reusable/free pages nếu API/library hỗ trợ
Estimated reclaimable size
```

---

## 20. Rebuild / clear / corruption

Actions:

```text
Reconcile Now
Rebuild Indexable Data
Compact Archive
Clear Archive
Disable Archive
Repair Hook
```

`Clear Archive` chỉ xóa Monitor-owned archive data, không chạm `~/.codex/sessions`.

Quan trọng: khi SQLite đã giữ ARCHIVED sessions mà raw JSONL không còn, database **không còn hoàn toàn disposable**.

Cần phân biệt:

```text
rebuildable indexed data
preserved archive-only analytics
```

Full rebuild từ raw JSONL có thể không khôi phục phần archive-only đã mất.

UI phải cảnh báo khi `Clear Archive`, migration destructive hoặc recovery action có thể xóa archive-only history.

Corruption handling phải ưu tiên preserve phần còn đọc được và isolate damaged data thay vì xóa toàn DB ngay.

---

## 21. Privacy / data minimization

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

Nếu metadata field có khả năng chứa secret, sanitize hoặc không persist.

Không cần FTS5 trong v1 nếu Manager search/filter metadata là đủ.

Content search prompt/response nếu có trong tương lai phải là privacy feature riêng, explicit opt-in; không được âm thầm mở rộng schema.

---

## 22. Multiple Codex sessions / concurrency

Phải hỗ trợ nhiều Codex session cùng lúc:

```text
Codex A ─┐
Codex B ─┼─→ hooks/fs events → Archive Service → SQLite WAL
Codex C ─┘                         ↑
                                  │
                         Manager read/query
```

Một session lỗi/malformed không được chặn ingestion session khác.

Queue phải bounded/fair để một JSONL khổng lồ không starvation các active small deltas khác.

Priority ingestion nên thiên về:

```text
active LIVE delta
→ recent changed sources
→ historical backfill
→ maintenance/compact
```

---

## 23. Cross-platform

Windows/Linux/macOS giữ cùng product semantics.

OS-specific implementation nằm sau platform/service abstraction.

Phải test:

- filesystem watching;
- recursive session discovery;
- path normalization;
- file identity/truncation detection;
- process/service lifecycle;
- sleep/wake;
- SQLite packaging/native dependency behavior;
- hook installation/removal;
- uninstall cleanup.

Không assume Bun chỉ vì reference project khác dùng Bun.

Codex Monitor hiện target Node; SQLite package/runtime phải phù hợp Node support policy và packaging của project.

---

## 24. Installation / uninstall

Khi Archive enabled, config/installer layer có thể cần:

```text
validate Codex hook capability/version
install/enable Monitor-owned hook/plugin integration
create Monitor archive directory
initialize/migrate SQLite
start/wake service
```

Không thay đổi official Codex binary.

Uninstall Codex Monitor:

- remove only Monitor-owned hook/plugin integration;
- stop/remove Archive Service components;
- không xóa official Codex;
- không xóa Codex auth;
- không xóa raw Codex sessions;
- archive DB deletion phải explicit/clearly explained.

Không được phá hook/plugin của project khác.

---

## 25. Performance requirements

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
Manager first-render time
Manager search/filter latency
Manager detail-chart query latency
10 / 100 / 1,000 / 10,000 session scale nếu fixture cho phép
multiple simultaneous LIVE sessions
archive compact cost
```

First backfill có thể tốn I/O/CPU; phải bounded, yield event loop và show progress thay vì saturate máy.

Không load toàn bộ SQLite vào một JS object graph.

Use pagination/range queries/aggregates phù hợp.

---

## 26. Failure model

Bắt buộc fail-soft:

```text
SQLite locked
→ queue/defer/retry

Archive Service crash
→ Codex unaffected
→ restart catches up from committed_offset

Hook failure
→ Codex unaffected
→ watcher/reconcile repairs later

fs.watch missed event
→ safety/startup reconcile repairs later

DB unavailable
→ Manager JSONL fallback where possible

DB stale
→ mark state, reconcile; do not fabricate

Malformed JSONL
→ isolate/report; do not corrupt unrelated sessions

Manager closed
→ enabled Archive Service may continue incremental indexing
```

---

## 27. Archive integrity state

Manager phải có đủ state để chứng minh archive healthy, không chỉ "service đang chạy":

```text
schema_version
last_successful_reconcile
last_seen_source_scan
reconcile_generation
pending_file_count
pending_byte_count
failed_file_count
hook_last_seen_at
watcher_last_seen_at
service_instance_id
```

Canonical UI levels:

```text
INDEX ● READY
INDEX ◐ CATCHING UP
INDEX ! ATTENTION
INDEX ○ DISABLED
```

`READY` chỉ sau successful source reconciliation generation, không phải chỉ vì queue tạm thời trống.

---

## 28. Auto test bắt buộc

- Config screen opens from Manager `C` and returns with Esc;
- `codexm --configure` và Manager `C` dùng cùng config schema/validation;
- Archive OFF → ON performs initialize/hook/service/reconcile sequence;
- Archive ON → OFF stops service/hook activity but keeps DB;
- Clear Archive never deletes raw Codex files;
- hook failure does not fail Codex path;
- fs.watch miss simulated → safety/startup reconcile catches data;
- service crash/restart catches up from committed offset;
- incremental offset resume;
- partial JSONL last line;
- duplicate hook/fs events do not duplicate rows;
- truncate/replace recovery;
- atomic derived data + committed offset transaction;
- SQLite busy/locked retry;
- multi-session ingest;
- fairness: historical huge file does not starve LIVE deltas;
- Manager SQLite-first first render;
- Manager detects UNINDEXED/CATCHING_UP/STALE/ARCHIVED correctly;
- Manager historical SELECT/pagination;
- LIVE SQLite snapshot + JSONL delta correctness;
- overlay rebase does not double-count after DB commit;
- raw JSONL external deletion → ARCHIVED;
- ARCHIVED analytics remains queryable;
- raw delete can preserve archive;
- archive-only delete cascades child rows correctly;
- Delete Everything handles partial failure honestly;
- retention default Forever / auto cleanup Off;
- configured pruning never deletes LIVE;
- DB delete/free-page behavior does not trigger heavy vacuum automatically;
- Compact Archive does not block Codex path;
- no prompt/response/full tool-output persistence by default;
- zero archive network requests;
- disabled archive means zero Archive Service activity;
- terminal/PTY regression suite remains green.

---

## 29. Manual QA

Dùng temp/fake sessions trước.

Scenarios:

```text
1. Enable Archive từ Manager → C → Archive.
2. Enable Archive bằng codexm --configure và verify cùng config state.
3. Run Codex → không mở Manager → kết thúc → mở Manager sau; session đã được index.
4. Grow một JSONL lớn → verify chỉ appended bytes sau committed_offset được đọc.
5. Run nhiều Codex sessions đồng thời.
6. Kill Archive Service giữa session → restart → verify catch-up.
7. Simulate missed hook và missed watcher event → verify recovery reconcile.
8. Manager mở khi SQLite có 1,000 sessions nhưng local có thêm 20 files → render DB trước, index 20 files dần.
9. Manager mở với một 2 GB UNINDEXED JSONL → UI không block.
10. Delete raw ENDED JSONL nhưng giữ archive → session thành ARCHIVED.
11. Delete Archive only → raw JSONL vẫn còn và có thể reindex.
12. Delete Everything → verify raw/archive semantics + partial failure reporting.
13. Delete nhiều archive rows → verify DB pages reused; file không cần shrink ngay.
14. Run Compact Archive khi idle fixture → verify reclaim/progress/failure safety.
15. Disable Archive → verify zero service/write activity.
16. Re-enable Archive → reconcile changed/new JSONLs.
17. Simulate locked/stale/corrupt DB trên disposable fixture.
18. Verify Live Codex input/latency unchanged đáng kể với Archive enabled vs disabled.
19. Verify Archive Health UI không báo READY khi còn pending/failed/unindexed source.
20. Verify Manager Config Save không hot-mutate một unrelated running Live terminal unless a future explicit hot-reload feature is implemented.
```

Không destructive-test lần đầu trên important real sessions.

---

## 30. Deliverables

Implementation deliverables dự kiến:

```text
Config screen + tab navigation
shared ConfigController / config schema
Archive tab + health/actions
Codex hook integration
Archive Service lifecycle
JSONL watcher + safety reconcile
incremental tail + committed offsets
SQLite schema + migrations
foreign keys + cascade rules
batch writer
Archive health metadata
Manager archive repository/query layer
SQLite-first startup
LIVE JSONL overlay/rebase
storage/archive delete semantics
retention/cleanup contract
Compact Archive implementation
cross-platform service/hook abstraction
```

QA deliverables:

```text
docs/qa/phase-11-1/AUTO-TEST-REPORT.md
docs/qa/phase-11-1/MANUAL-TEST-REQUIRED.md
docs/qa/phase-11-1/KNOWN-ISSUES.md
docs/qa/phase-11-1/PHASE-11-1-RESULT.md
```

---

## 31. Exit gate

Phase 11-1 chỉ được close khi:

```text
✓ Codex/Live path không phụ thuộc SQLite
✓ hook + fs.watch đều chỉ là signals; missed signal không gây missed data
✓ startup/safety reconcile chứng minh catch-up từ committed offsets
✓ hooks fail-soft
✓ Archive Service không chạy khi feature disabled
✓ large JSONL không bị reparse từ đầu sau committed offset
✓ multiple sessions ingest ổn định/fair
✓ Manager first render ưu tiên SQLite và không block bởi historical backfill
✓ Manager biết rõ READY/CATCHING_UP/UNINDEXED/STALE/ARCHIVED
✓ LIVE realtime không phụ thuộc batch SQLite latency
✓ ARCHIVED session giữ được persisted analytics khi raw JSONL mất
✓ SQLite dùng một DB file với nhiều bảng chuyên biệt + fast sessions summary
✓ archive delete cascades an toàn, không đụng raw data ngoài ý muốn
✓ raw delete có thể giữ analytics
✓ retention mặc định Forever, auto cleanup Off
✓ SQLite growth có user-controlled cleanup/compact mechanism
✓ default archive không lưu conversation transcript/content
✓ no archive network traffic
✓ Manager `C` mở Config screen riêng với tabs đã định nghĩa
✓ `codexm --configure` và Manager Config dùng cùng engine
✓ clear/delete semantics không thể nhầm raw Codex data với Monitor archive
✓ Windows verified
✓ Linux/macOS giữ explicit verification status theo project policy
✓ performance/stress regression gate PASS
```

---

## 32. Trạng thái hiện tại

```text
PLANNED — supplemental sub-phase; Phase 11 hiện tại tiếp tục độc lập
```

Implementation của Phase 11-1 không được bắt đầu bằng cách sửa scope giữa chừng của file Phase 11 hiện tại. Khi cần integration cuối, thực hiện qua contract rõ ràng và QA regression thay vì silently rewriting Phase 11.
