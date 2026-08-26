# Phase 13 — Productization, Full QA, Packaging & Release Candidate

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor v1 implementation baseline.  
> **Sequencing:** Phase 12 Product Shell / CLI / Onboarding phải CLOSED trước khi Phase 13 đóng Release Candidate.

## Trạng thái

```text
NOT STARTED
```

## Mục tiêu

Không thêm feature lớn. Harden Live Monitor + Session Manager + Product Shell thành Release Candidate có thể public.

Phase 13 **không được tự phát minh lại CLI/onboarding semantics**. Các command route, first-run, config persistence, Manager default view và reset semantics thuộc Phase 12.

## Phạm vi phải làm

### CLI/product contract hardening

Verify/finalize contract đã khóa ở Phase 12:

- `codexm` passive Live HUD;
- `codexm --manager` independent Session Manager;
- configure/reset/config/config-path/doctor/diagnostics/repair/version/update/uninstall;
- Manager default-view persistence + one-shot override;
- unknown Codex args forwarding + `--` escape hatch;
- không public Monitor-owned `--history` feature.

### Config hardening

- schema migration/versioning;
- onboarding/setup-complete compatibility;
- preset/theme/language/sections/metrics/header/background/update preference;
- Manager default view;
- reset không đụng official Codex auth/sessions;
- migration matrix từ các config version đã ship/develop.

### Updater

- GitHub Releases source of truth;
- automatic check tối đa khoảng 24h;
- startup non-blocking;
- auto-install OFF;
- no telemetry/project/token payload;
- update failure không chặn Live/Manager.

### Security/privacy

- diagnostics redaction;
- ANSI/control input sanitization cho Manager/onboarding rendering;
- no secret in config/cache/logs;
- no monitoring network;
- package integrity/SHA256;
- signing/timestamp where feasible.

### Full QA — Live

- Login/API/unknown;
- Recommended/Compact/Full/Custom;
- passive keyboard ownership;
- exact current-run truth;
- first-run/config interaction regression;
- visual baseline + responsive + terminal restore;
- theme/background/capability fallback.

### Full QA — Manager

- multi-LIVE dashboard;
- Operations/Table/Charts/Auto;
- session table/search/filter/sort;
- selected detail tabs/charts;
- ended sessions;
- storage/delete safety;
- default-view persistence / one-shot override;
- thousands-session/huge-file stress;
- responsive/capability fallback;
- terminal restore.

### Full QA — Product Shell

- clean install first-run;
- upgrade existing config without forced onboarding;
- configure/save/cancel;
- reset safety;
- help/discoverability;
- non-interactive no-prompt;
- CLI passthrough/collision suite;
- doctor/diagnostics/repair behavior;
- update/uninstall UX.

### Cross-platform

Compatibility matrix:

```text
Windows
Linux
macOS
```

Platform chưa test thật phải ghi rõ `UNVERIFIED PLATFORM`; không giả PASS.

### Documentation/release

- README;
- SECURITY;
- PRIVACY;
- CHANGELOG/release notes;
- PROJECT-SPEC + RoadMap consistency;
- CLI reference;
- onboarding/configuration guide;
- Manager guide;
- install/upgrade/uninstall instructions;
- release artifacts + SHA256SUMS.

## Packaging / install contract

Release smoke test phải xác nhận:

- command `codexm` được expose đúng;
- package không bundle secrets/local config/session data;
- clean install tạo Monitor-owned directories/files đúng lúc;
- uninstall không xóa official Codex auth/sessions;
- upgrade giữ/migrate Monitor config;
- rollback/failure không làm hỏng Codex CLI installation hiện có.

## Không làm trong Phase 13

- Không thêm large feature sau RC trừ bugfix bắt buộc.
- Không đổi product semantics âm thầm trong code.
- Không thêm analytics/storage/onboarding feature mới để né phase gate trước.
- Không public support claim cho platform chưa verify mà không disclosure.
- Không auto-install update mặc định.
- Không telemetry upload.

## Auto test bắt buộc

- toàn unit/integration/snapshot/fuzz/security/CLI/config/platform/Manager/onboarding suites;
- package smoke/install trong temp environment;
- clean install + upgrade config migration;
- uninstall safety fixtures;
- update metadata behavior;
- no-network monitoring assertions;
- diagnostics redaction;
- full regression;
- CI matrix nếu hạ tầng có.

## Manual test bắt buộc

- clean install;
- first-run onboarding;
- normal Live launch;
- Manager launch đúng persisted view;
- Configure/Reset;
- upgrade từ config cũ;
- update UX;
- uninstall và xác nhận Codex/auth/sessions còn nguyên;
- Live visual/input/restore;
- Manager visual/data/delete workflow;
- release checklist PASS/FAIL/N/A.

## Deliverables

```text
Release artifact/package
SHA256SUMS
README
SECURITY
PRIVACY
CHANGELOG
CLI/configuration documentation
PROJECT-SPEC + RoadMap synced
Full test summary
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

## Exit gate

Phase 13 chỉ CLOSED khi:

- Phase 01–12 mandatory gates không có unresolved release blocker;
- all mandatory tests PASS;
- BLOCKER = 0;
- P0 = 0;
- manual required PASS;
- privacy/network/install/upgrade/uninstall/restore PASS;
- package smoke PASS;
- platform claims đúng evidence;
- user duyệt Release Candidate trước public.
