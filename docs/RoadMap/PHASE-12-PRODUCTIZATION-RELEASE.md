# Phase 12 — Productization, Full QA, Packaging & Release Candidate

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor v1 implementation baseline, frozen 2026-08-25.

## Spec liên quan

Sections 10, 30, 33–40, 42–44.

## Mục tiêu

Không thêm feature lớn; harden Live Monitor + Session Manager thành Release Candidate có thể public.

## Phạm vi phải làm

### CLI/product contract

- `codexm` passive Live HUD;
- `codexm --manager` independent Session Manager;
- configure/reset/config/config-path/doctor/diagnostics/repair/version/update/uninstall;
- unknown Codex args forwarding + `--` escape hatch;
- không public `--history` feature.

### Config

- schema migration/versioning;
- no Live Tabs config;
- preset/theme/language/sections/metrics/header/background/update preference;
- reset không đụng official Codex auth/sessions.

### Updater

- GitHub Releases source of truth;
- automatic check tối đa khoảng 24h;
- startup non-blocking;
- auto-install OFF;
- no telemetry/project/token payload.

### Security/privacy

- diagnostics redaction;
- ANSI/control input sanitization for Manager rendering;
- no secret in config/cache/logs;
- no monitoring network;
- package integrity/SHA256;
- signing/timestamp where feasible.

### Full QA

Live:

- Login/API/unknown;
- Recommended/Compact/Full/Custom;
- passive keyboard ownership;
- current-run truth;
- visual baseline + responsive + terminal restore.

Manager:

- multi-LIVE dashboard;
- session table/search/filter/sort;
- selected detail tabs/charts;
- ended sessions;
- storage/delete safety;
- thousands-session/huge-file stress;
- responsive/capability fallback;
- terminal restore.

### Cross-platform

Compatibility matrix Windows/Linux/macOS. Platform chưa test thật phải ghi rõ UNVERIFIED, không giả PASS.

### Documentation/release

- README;
- SECURITY/PRIVACY;
- CHANGELOG/release notes;
- PROJECT-SPEC + RoadMap consistency;
- install/upgrade/uninstall instructions;
- release artifacts + SHA256SUMS.

## Không làm trong Phase 12

- Không thêm large feature sau RC trừ bugfix bắt buộc.
- Không đổi product semantics âm thầm trong code.
- Không public support claim cho platform chưa verify mà không disclosure.

## Auto test bắt buộc

- toàn unit/integration/snapshot/fuzz/security/CLI/config/platform/Manager suites;
- package smoke/install temp environment;
- update metadata behavior;
- full regression;
- CI matrix nếu hạ tầng có.

## Manual test bắt buộc

- clean install;
- upgrade;
- uninstall và xác nhận Codex/auth/sessions còn nguyên;
- Live visual/input/restore;
- Manager visual/data/delete workflow;
- release checklist PASS/FAIL/N/A.

## Deliverables

```text
Release artifact/package
SHA256SUMS
README + SECURITY + PRIVACY + CHANGELOG
PROJECT-SPEC + RoadMap synced
Full test summary
Known issues
Compatibility matrix
RELEASE-MANUAL-CHECKLIST.md
```

Ngoài ra `docs/qa/phase-12/` phải có đủ 4 handoff files chuẩn.

## Exit gate

All mandatory tests PASS, BLOCKER=0, P0=0, manual required PASS, privacy/network/install/restore PASS; user duyệt RC trước public.

## Trạng thái hiện tại

```text
NOT STARTED UNDER 2026-08-25 BASELINE
```
