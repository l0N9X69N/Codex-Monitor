# Phase 08 — History Core Engine

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor Final Project Specification v1, design freeze 2026-08-24. Nếu tài liệu phase mâu thuẫn với `PROJECT-SPEC.md`, **PROJECT-SPEC.md thắng**.

> **Bổ sung UX đã chốt sau spec:** Live phải hiện đại, gọn, làm nổi bật thông tin cần xem. History giữ tinh thần cyberpunk/hacker/netrunner tương lai nhưng không nhồi tràn lan một màn hình; ưu tiên nhiều panel/biểu đồ có khoảng thở, responsive và chuyển động từ dữ liệu thật.


## Spec liên quan

Spec Phase E; mục 31–32, 36–43, 45, 48.

## Mục tiêu

Xây data engine cho `codexm --history`: local JSONL, RAM index, lazy parse, live-tail, không DB.

## Phạm vi phải làm

- Session discovery từ Codex sessions path.
- Startup nhẹ: discover/stat -> show metadata -> parse visible/selected lazily.
- RAM-only index v1; không SQLite/CSV/history DB.
- Historical normalized model cho Info/Tokens/Turns/Tools/Resources/Errors.
- Incremental live-tail bằng remembered offset; không reread toàn file.
- Historical provenance: không scan config/filesystem hiện tại để bịa session cũ.
- Missing values giữ `--`; không cost/pricing.

## Không làm trong phase

- Chưa làm visual cyberpunk hoàn chỉnh.
- Chưa render charts.
- Chưa delete.

## Đầu ra bắt buộc

- History discovery/index API.
- Lazy parser.
- Incremental tail.
- Historical normalized model.
- Sanitized History fixtures.

Ngoài ra luôn phải có bộ bàn giao chung:

```text
PHASE-08-RESULT.md
AUTO-TEST-REPORT.md
MANUAL-TEST-REQUIRED.md
KNOWN-ISSUES.md
```

## Auto test

- 0/1/1000+ fake sessions.
- Startup không deep parse tất cả.
- Visible-first/selected parse.
- Partial append + complete append + no duplicate.
- File truncate/rotation/error safe.
- Completed session static.
- Resources evidence-only.
- No DB created.
- `--history` không spawn Codex.

## Manual test / phần cần người dùng xác nhận

- Folder session thật lớn.
- Live-tail một session Codex đang grow.

Nếu không thể auto test đáng tin, phase phải ghi rõ case trong `MANUAL-TEST-REQUIRED.md`; không được im lặng coi như đã PASS.

## Exit gate

History data layer độc lập UI, lazy và incremental, không historical fabrication.

## Trạng thái ban đầu

```text
NOT STARTED
```
