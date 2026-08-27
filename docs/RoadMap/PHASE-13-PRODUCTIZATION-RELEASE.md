# Phase 13 — Productization, Full QA, Packaging & Release Candidate

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor v1 implementation baseline.  
> **Sequencing:** Phase 12 Product Shell / CLI / Onboarding phải CLOSED trước khi Phase 13 đóng Release Candidate.  
> **Archive dependency:** Phase 11-1 Local Session Archive phải đạt gate release-compatible trước khi Phase 13 có thể đóng RC nếu Archive được ship trong v1.

## Trạng thái

```text
IMPLEMENTED CANDIDATE — AUTO VERIFICATION + MANUAL RC/POLISH PENDING
```

## Mục tiêu

Không thêm feature lớn. Harden Live Monitor + Session Manager + Product Shell + Local Session Archive thành Release Candidate có thể public.

Phase 13 **không được tự phát minh lại CLI/onboarding/archive semantics**. Các command route, first-run, shared Config persistence thuộc Phase 12; Archive/Hook/SQLite ingest/storage semantics thuộc Phase 11-1.

---

## 1. Phạm vi phải làm

### CLI/product contract hardening

Verify/finalize contract đã khóa ở Phase 12:

- `codexm` passive Live HUD;
- `codexm --manager` independent Session Manager;
- Manager `C` mở shared Config screen;
- `codexm --configure` dùng cùng Config engine;
- configure/reset/config/config-path/doctor/diagnostics/repair/version/update/uninstall;
- Manager default-view persistence + one-shot override;
- unknown Codex args forwarding + `--` escape hatch;
- không public Monitor-owned `--history` feature.

### Config hardening

- schema migration/versioning;
- onboarding/setup-complete compatibility;
- preset/theme/language/sections/metrics/header/background/update preference;
- Companion config;
- Manager default view;
- Local Session Archive config: enabled/retention/size limit;
- Archive default Disabled cho user chưa explicit opt-in;
- reset không đụng official Codex auth/sessions/archive DB;
- migration matrix từ các config version đã ship/develop;
- migration không tự install hooks/start service.

### Local Session Archive hardening

Phase 13 phải release-harden implementation từ Phase 11-1:

```text
Codex hooks
Archive Service
fs watcher + safety reconcile
incremental JSONL tail
committed offsets
SQLite schema/migrations
SQLite-first Manager queries
LIVE JSONL overlay/rebase
ARCHIVED session semantics
retention / cleanup / compact
```

Bắt buộc verify product law:

> Hook và fs.watch chỉ là signals; missed signal không được gây missed data.

Release QA phải chứng minh startup/recovery/safety reconcile có thể catch up từ JSONL + committed offsets sau missed hook, missed fs.watch, sleep/wake hoặc service crash.

### SQLite packaging / runtime

- SQLite dependency/runtime phải hoạt động trên supported Node/platform matrix;
- package không phụ thuộc Bun nếu product không chuyển runtime có chủ đích;
- native addon nếu dùng phải có packaging/install fallback/error UX rõ;
- schema migration phải crash-safe;
- WAL/busy-timeout/foreign-key settings được verify;
- không load toàn DB vào JS memory;
- archive DB path/permissions owner-only phù hợp platform;
- archive file không được world-writable trên platform cho phép kiểm soát quyền.

### Archive Service lifecycle / platform integration

Release phải verify:

```text
enable
→ hook integration
→ service start/wake
→ reconcile

disable
→ service stop
→ Monitor-owned hook disabled/removed
→ archive DB kept

uninstall
→ service removed/stopped
→ only Monitor-owned hooks removed
→ Codex/auth/raw sessions preserved
```

Nếu implementation dùng OS-level user service/startup mechanism thì phải có installer/uninstaller/upgrade/rollback test tương ứng trên từng platform được claim support.

Archive disabled phải có **zero background Archive Service activity**.

### Updater

- GitHub Releases source of truth;
- automatic check tối đa khoảng 24h;
- startup non-blocking;
- auto-install OFF;
- no telemetry/project/token/archive payload;
- update failure không chặn Live/Manager/Archive;
- updater không chạy thông qua Archive Service.

### Security/privacy

- diagnostics redaction;
- ANSI/control input sanitization cho Manager/onboarding/config rendering;
- no secret in config/cache/logs/SQLite metadata;
- no monitoring/archive network traffic;
- package integrity/SHA256;
- signing/timestamp where feasible;
- archive hook payload không persist raw prompt/tool output mặc định;
- local service IPC nếu có phải local-only/owner-restricted;
- JSONL content được parse như data, không execute;
- source paths/session IDs phải validate trước destructive operations.

---

## 2. Full QA — Live

- Login/API/unknown;
- Recommended/Compact/Full/Custom;
- passive keyboard ownership;
- exact current-run truth;
- first-run/config interaction regression;
- visual baseline + responsive + terminal restore;
- theme/background/capability fallback;
- Archive enabled/disabled không làm tăng input latency đáng kể;
- Archive crash/SQLite lock không ảnh hưởng Codex PTY/HUD.

---

## 3. Full QA — Manager

- multi-LIVE dashboard;
- Operations/Table/Charts/Auto;
- session table/search/filter/sort;
- selected detail tabs/charts;
- LIVE / ENDED / ARCHIVED sessions;
- SQLite-first initial render;
- READY/CATCHING_UP/UNINDEXED/STALE/ARCHIVED states;
- SQLite base + live JSONL delta merge;
- overlay rebase không double-count;
- Manager Config `C` navigation;
- Archive health UI;
- storage/delete safety;
- raw/archive/everything delete semantics;
- default-view persistence / one-shot override;
- thousands-session/huge-file stress;
- responsive/capability fallback;
- terminal restore.

---

## 4. Full QA — Archive correctness

Bắt buộc có fixtures/scenarios:

- hook signal missed;
- fs.watch signal missed;
- both signals missed while service later reconciles;
- service crash mid-ingest;
- crash after parse nhưng trước transaction commit;
- partial JSONL line;
- malformed line;
- source truncate/replace;
- external source deletion;
- sleep/wake;
- parser/schema migration;
- multiple simultaneous LIVE files;
- huge historical backfill + active LIVE fairness;
- SQLite locked/busy;
- DB unavailable/stale;
- unindexed huge JSONL does not block Manager first render;
- committed offset never advances past successfully committed data;
- duplicate wake/events do not duplicate rows;
- Manager READY only after verified reconcile generation.

---

## 5. Full QA — Archive storage / retention

Verify:

```text
Delete Raw
Delete Archive
Delete Everything
```

- Delete Raw giữ analytics khi user chọn giữ;
- Delete Archive không xóa raw JSONL;
- Delete Everything report partial failure trung thực;
- LIVE không bị destructive delete;
- cascade child rows đúng;
- archive-only history không bị coi là disposable cache;
- Clear Archive warning rõ vì ARCHIVED history có thể không rebuild được;
- default retention = Forever;
- default auto cleanup = Off;
- size limit chỉ prune nếu user explicit bật policy;
- prune không bao giờ xóa LIVE;
- SQLite deleted rows có thể reuse free pages;
- không full VACUUM sau mỗi delete;
- Compact Archive không block Codex và có failure/progress semantics phù hợp.

---

## 6. Full QA — Product Shell

- clean install first-run;
- Archive vẫn Disabled mặc định nếu user chưa opt-in;
- upgrade existing config without forced onboarding;
- old config migration không tự enable Archive;
- Manager `C` và `--configure` cùng config state;
- configure/save/cancel/revert;
- Archive OFF→ON lifecycle;
- Archive ON→OFF giữ DB;
- reset safety;
- help/discoverability;
- non-interactive no-prompt;
- CLI passthrough/collision suite;
- doctor/diagnostics/repair behavior;
- update/uninstall UX.

---

## 7. Doctor / diagnostics / repair hardening

`--doctor` / diagnostics có thể report sanitized:

```text
Archive enabled/disabled
SQLite schema/open status
Service running/stopped
Hook installed/missing/incompatible
Watcher/reconcile health
Pending/failed file count
Last successful reconcile
```

Không dump:

```text
prompts
assistant responses
full tool output
raw transcript
API keys/login token
```

`--repair` phải:

- chỉ repair Monitor-owned hooks/service integration;
- không phá hook/plugin của app khác;
- không xóa SQLite archive để repair nếu user chưa explicit destructive confirm;
- không modify official Codex binary;
- fail-soft để Codex vẫn usable.

---

## 8. Cross-platform

Compatibility matrix:

```text
Windows
Linux
macOS
```

Ngoài core PTY/platform checks, Archive release claims cần evidence cho:

- Codex hook integration/version compatibility;
- filesystem watching + recursive source discovery;
- file identity/truncation detection;
- sleep/wake recovery;
- SQLite package/native runtime;
- service start/stop/upgrade/uninstall;
- archive/config data paths and permissions;
- terminal Config/Manager UX.

Platform chưa test thật phải ghi rõ `UNVERIFIED PLATFORM`; không giả PASS.

Nếu Archive không thể release-quality trên một platform, docs/package phải disclose rõ hoặc disable capability an toàn thay vì giả support.

---

## 9. Documentation/release

Bắt buộc cập nhật:

- README;
- SECURITY;
- PRIVACY;
- CHANGELOG/release notes;
- PROJECT-SPEC + RoadMap consistency;
- CLI reference;
- onboarding/configuration guide;
- Manager guide;
- Local Session Archive guide;
- Archive privacy/data-retention explanation;
- install/upgrade/uninstall instructions;
- troubleshooting/doctor/repair;
- release artifacts + SHA256SUMS.

Docs phải nói rõ:

```text
JSONL = Codex-owned raw source
SQLite = Monitor-owned technical analytics archive
Archive = optional/local-only
Archive disabled = no background Archive Service
Clear Archive != delete Codex sessions
Delete Raw có thể giữ analytics
ARCHIVED session có thể tồn tại khi JSONL đã mất
```

---

## 10. Packaging / install contract

Release smoke test phải xác nhận:

- command `codexm` được expose đúng;
- package không bundle secrets/local config/session/archive data;
- clean install tạo Monitor-owned directories/files đúng lúc;
- Archive Disabled không cài/start background component ngoài contract;
- Archive opt-in tạo/migrate DB và hook/service components đúng;
- upgrade giữ/migrate Monitor config + archive schema;
- upgrade không làm mất archive-only history;
- uninstall không xóa official Codex auth/sessions;
- uninstall không xóa archive DB trừ explicit product flow/documented choice;
- uninstall remove/disable only Monitor-owned hooks/service;
- rollback/failure không làm hỏng Codex CLI installation hiện có;
- failed archive migration không làm Live Monitor unusable.

---

## 11. Upgrade / rollback requirements

Archive khiến upgrade phức tạp hơn nên Phase 13 phải test riêng:

```text
old app + old config + old DB
→ new app
→ config migration
→ SQLite schema migration
→ service/hook compatibility check
→ reconcile
```

Rules:

- migration phải versioned;
- không destructive schema reset mặc định;
- archive-only history phải preserve khi có thể;
- nếu migration fail, giữ DB backup/original hoặc transaction-safe rollback strategy;
- app có thể fallback JSONL/disable Archive runtime thay vì phá Codex;
- downgrade incompatibility phải được document nếu không support rollback schema.

Không được silently delete/recreate DB chỉ vì schema mismatch.

---

## 12. Performance/release budgets

Phase 13 phải ghi lại benchmark release baseline cho:

```text
Live input latency with Archive OFF
Live input latency with Archive ON
Archive Service idle CPU/RAM
Archive Service active CPU/RAM
incremental append latency
Manager cold-open / first-render
Manager search/filter latency
huge unindexed JSONL backfill
multiple LIVE sessions
SQLite DB growth/session
Compact Archive cost
```

Không cần freeze một con số cảm tính trước benchmark, nhưng regression rõ rệt trên weak machine phải block RC nếu ảnh hưởng Codex usage.

Archive Service idle phải effectively sleeping, không periodic high-I/O scan.

---

## 13. Không làm trong Phase 13

- Không thêm large feature sau RC trừ bugfix bắt buộc.
- Không đổi product semantics âm thầm trong code.
- Không thêm analytics/storage/onboarding/archive feature mới để né phase gate trước.
- Không đổi SQLite thành conversation memory/vector DB.
- Không thêm transcript/content persistence mặc định.
- Không public support claim cho platform chưa verify mà không disclosure.
- Không auto-install update mặc định.
- Không telemetry upload.
- Không auto-enable Archive cho existing/new user không explicit opt-in.

---

## 14. Auto test bắt buộc

- toàn unit/integration/snapshot/fuzz/security/CLI/config/platform/Manager/onboarding/archive suites;
- package smoke/install trong temp environment;
- clean install + upgrade config migration;
- archive schema migration fixture;
- Archive OFF zero-background assertion;
- hook install/remove ownership assertions;
- missed hook/watcher recovery;
- committed-offset crash safety;
- SQLite lock/corruption/stale fallback;
- LIVE overlay/rebase correctness;
- ARCHIVED persistence after raw deletion;
- retention/prune/compact safety;
- uninstall safety fixtures;
- update metadata behavior;
- no-network monitoring/archive assertions;
- diagnostics redaction;
- full regression;
- CI matrix nếu hạ tầng có.

---

## 15. Manual test bắt buộc

- clean install;
- first-run onboarding với Archive Disabled;
- normal Live launch;
- Manager launch đúng persisted view;
- Manager `C` Config;
- `--configure` shared state;
- Archive enable → hook/service/SQLite/reconcile healthy;
- run Codex while Manager closed → open later, history indexed;
- simulate service restart/missed signal fixture;
- raw delete giữ archive → ARCHIVED;
- archive-only delete giữ raw;
- Compact Archive;
- Archive disable → no service/hook activity, DB retained;
- Configure/Reset;
- upgrade từ config/DB cũ;
- update UX;
- uninstall và xác nhận Codex/auth/sessions còn nguyên;
- verify Monitor-owned hook/service removed;
- verify archive DB treatment đúng lựa chọn/documentation;
- Live visual/input/restore;
- Manager visual/data/delete/archive workflow;
- release checklist PASS/FAIL/N/A.

---

## 16. Deliverables

```text
Release artifact/package
SHA256SUMS
README
SECURITY
PRIVACY
CHANGELOG
CLI/configuration documentation
Manager documentation
Local Session Archive documentation
Archive privacy/retention documentation
PROJECT-SPEC + RoadMap synced
Full test summary
Performance baseline
Known issues
Compatibility matrix
RELEASE-MANUAL-CHECKLIST.md
```

Ngoài ra:

```text
docs/qa/phase-13/PHASE-13-RESULT.md
docs/qa/phase-13/AUTO-TEST-REPORT.md
docs/qa/phase-13/MANUAL-TEST-REQUIRED.md
docs/qa/phase-13/KNOWN-ISSUES.md
```

---

## 17. Exit gate

Phase 13 chỉ CLOSED khi:

- Phase 01–12 mandatory gates không có unresolved release blocker;
- nếu Local Session Archive ship trong v1: Phase 11-1 release-compatible gate PASS;
- all mandatory tests PASS;
- Archive missed-signal recovery PASS;
- Archive crash/SQLite failure không ảnh hưởng Codex/Live PASS;
- Archive OFF zero-background PASS;
- Archive privacy/no-network PASS;
- SQLite/config/schema migration PASS;
- hook/service install-upgrade-uninstall ownership PASS;
- raw/archive delete safety PASS;
- archive-only history preservation semantics PASS;
- BLOCKER = 0;
- P0 = 0;
- manual required PASS;
- privacy/network/install/upgrade/uninstall/restore PASS;
- package smoke PASS;
- performance regression gate PASS;
- platform claims đúng evidence;
- user duyệt Release Candidate trước public.
