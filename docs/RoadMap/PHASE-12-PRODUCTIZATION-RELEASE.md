# Phase 12 — Productization, Full QA, Packaging & Release Candidate

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor Final Project Specification v1, design freeze 2026-08-24. Nếu tài liệu phase mâu thuẫn với `PROJECT-SPEC.md`, **PROJECT-SPEC.md thắng**.

> **Bổ sung UX đã chốt sau spec:** Live phải hiện đại, gọn, làm nổi bật thông tin cần xem. History giữ tinh thần cyberpunk/hacker/netrunner tương lai nhưng không nhồi tràn lan một màn hình; ưu tiên nhiều panel/biểu đồ có khoảng thở, responsive và chuyển động từ dữ liệu thật.


## Spec liên quan

Spec Phase H; mục 5–7, 50–57, 63–65.

## Mục tiêu

Không thêm feature lớn; harden toàn bộ sản phẩm thành Release Candidate có thể public.

## Phạm vi phải làm

- Harden CLI: configure/reset/config/config-path/doctor/diagnostics/repair/version/update/uninstall.
- CLI passthrough + `--` escape hatch đúng contract.
- Config migration/version/path; reset không đụng Codex auth/history.
- Updater GitHub Releases: <= khoảng 24h auto-check, non-blocking, auto-install OFF, no telemetry payload.
- Diagnostics redaction/security/privacy/control-char sanitization.
- Install/upgrade/uninstall/package/SHA256/signing nếu phù hợp.
- Full QA: Login/API/unknown, Live presets/Custom/all views, F4 History, History tabs/charts/live-tail/storage.
- Performance/stress: idle, tool-heavy, output-heavy, huge project, thousands history files, resize, ultrawide/narrow.
- Cross-platform compatibility matrix.
- README/changelog/release notes/docs.

## Không làm trong phase

- Không thêm feature lớn sau khi vào RC trừ bugfix bắt buộc.
- Không public khi platform được tuyên bố support nhưng chưa verified mà không ghi rõ.

## Đầu ra bắt buộc

- Release artifact/package.
- SHA256SUMS.
- README + changelog + PROJECT-SPEC + roadmap docs.
- Full test summary.
- Known issues.
- Compatibility matrix.
- `RELEASE-MANUAL-CHECKLIST.md`.

Ngoài ra luôn phải có bộ bàn giao chung:

```text
PHASE-12-RESULT.md
AUTO-TEST-REPORT.md
MANUAL-TEST-REQUIRED.md
KNOWN-ISSUES.md
```

## Auto test

- Chạy toàn unit/integration/snapshot/fuzz/platform-contract/history/security/CLI/config/package smoke suites.
- CI matrix nếu hạ tầng có.
- Install package vào temp/clean environment nếu có thể tự động.

## Manual test / phần cần người dùng xác nhận

- Clean install.
- Upgrade từ bản trước.
- Uninstall và xác nhận Codex/auth/history còn nguyên.
- Live/History visual check trên OS thực.
- Terminal restore/crash/resize.
- Release checklist có PASS/FAIL/N/A.

Nếu không thể auto test đáng tin, phase phải ghi rõ case trong `MANUAL-TEST-REQUIRED.md`; không được im lặng coi như đã PASS.

## Exit gate

All mandatory tests PASS, BLOCKER=0, P0=0, manual required PASS, privacy/network/install/restore PASS; user duyệt RC trước public.

## Trạng thái ban đầu

```text
NOT STARTED
```
