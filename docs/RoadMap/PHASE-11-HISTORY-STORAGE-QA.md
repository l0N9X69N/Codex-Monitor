# Phase 11 — History Storage, Delete Safety & History QA

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor Final Project Specification v1, design freeze 2026-08-24. Nếu tài liệu phase mâu thuẫn với `PROJECT-SPEC.md`, **PROJECT-SPEC.md thắng**.

> **Bổ sung UX đã chốt sau spec:** Live phải hiện đại, gọn, làm nổi bật thông tin cần xem. History giữ tinh thần cyberpunk/hacker/netrunner tương lai nhưng không nhồi tràn lan một màn hình; ưu tiên nhiều panel/biểu đồ có khoảng thở, responsive và chuyển động từ dữ liệu thật.


## Spec liên quan

Spec Phase G; mục 46–49 và checklist History mục 63.

## Mục tiêu

Hoàn thiện storage/delete và stress-test History trước productization.

## Phạm vi phải làm

- Storage: count, total size, oldest/newest, path, per-session size, largest sessions.
- Selection: Space/A/N/I/D semantics.
- Select All = visible eligible only.
- LIVE session không deletable.
- Delete confirmation có count + size; không auto retention, không backup ngầm.
- Pre-delete safety: path nằm trong approved sessions root, file state được revalidate, path escape/symlink risk xử lý an toàn.
- History stress: thousands sessions, huge file, malformed file, external deletion, live-tail+filter/sort, resize, chart update, quit/crash.

## Không làm trong phase

- Không test delete lần đầu trên real `~/.codex/sessions`.
- Không thêm automatic cleanup.

## Đầu ra bắt buộc

- Storage view + safe selection/delete flow.
- Temp-history destructive test suite.
- History stress suite.
- Manual delete checklist hai tầng.

Ngoài ra luôn phải có bộ bàn giao chung:

```text
PHASE-11-RESULT.md
AUTO-TEST-REPORT.md
MANUAL-TEST-REQUIRED.md
KNOWN-ISSUES.md
```

## Auto test

- Delete selected only.
- Select all visible/invert/none.
- LIVE protected.
- Filtered-out protected.
- Cancel/delete confirmation.
- Path escape rejected.
- Size/count accuracy.
- Delete errors handled.

## Manual test / phần cần người dùng xác nhận

- Tầng 1: fake/temp history full workflow.
- Tầng 2: chỉ sau khi tầng 1 PASS, test một session thật không quan trọng.

Nếu không thể auto test đáng tin, phase phải ghi rõ case trong `MANUAL-TEST-REQUIRED.md`; không được im lặng coi như đã PASS.

## Exit gate

0 delete-safety P0; LIVE protection xanh; History stress xanh.

## Trạng thái ban đầu

```text
NOT STARTED
```
