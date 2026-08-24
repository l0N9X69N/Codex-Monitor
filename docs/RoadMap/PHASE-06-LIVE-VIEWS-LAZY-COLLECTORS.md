# Phase 06 — Live Views & Lazy Collectors

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor Final Project Specification v1, design freeze 2026-08-24. Nếu tài liệu phase mâu thuẫn với `PROJECT-SPEC.md`, **PROJECT-SPEC.md thắng**.

> **Bổ sung UX đã chốt sau spec:** Live phải hiện đại, gọn, làm nổi bật thông tin cần xem. History giữ tinh thần cyberpunk/hacker/netrunner tương lai nhưng không nhồi tràn lan một màn hình; ưu tiên nhiều panel/biểu đồ có khoảng thở, responsive và chuyển động từ dữ liệu thật.


## Spec liên quan

Spec mục 13–20, 27–30, 59–60.

## Mục tiêu

Hoàn thiện 6 Live views mà vẫn demand-driven.

## Phạm vi phải làm

- Tools current-run only: aggregate, current/last tool, timestamp, turn, sanitized detail, errors.
- Resources: Instructions/Skills/MCP/Rules/Permissions metadata-only, lazy, không secret/body dump.
- Usage: context/token/cache/reasoning/turn/compaction/Login quota/model provenance/freshness.
- Performance: Codex/Monitor/system CPU-RAM + short sparklines, ring buffer in-memory only.
- Processes: normalized PID/PPID/name/command/CPU/RAM/age/tree/hot process.
- Git composite header với per-metric demand và không network fetch.
- System/project/disk lazy cached collectors.

## Không làm trong phase

- Không persist Performance history.
- Không đưa CPU/RAM/process vào History.
- Không pricing/cost.
- Không scan Resources khi không dùng.

## Đầu ra bắt buộc

- Overview/Performance/Processes/Tools/Resources/Usage functional.
- Collector dependency map.
- Sanitization rules.
- Demo fixtures cho từng view.

Ngoài ra luôn phải có bộ bàn giao chung:

```text
PHASE-06-RESULT.md
AUTO-TEST-REPORT.md
MANUAL-TEST-REQUIRED.md
KNOWN-ISSUES.md
```

## Auto test

- Enter/leave heavy view bật/tắt collector đúng.
- Resources unused -> 0 scan.
- Processes inactive -> 0 tree poll.
- API Usage -> no 5H/WEEK.
- Tools -> current-run only.
- Resource secret redaction.
- Git branch-only không chạy diff.
- Collector failure degrade an toàn.

## Manual test / phần cần người dùng xác nhận

- So sánh tương đối CPU/RAM với OS tools.
- Process tree khi Codex spawn npm/node/git.
- Resources trên project có/không Skills/MCP/AGENTS.
- Tab navigation không ăn phím prompt bình thường.

Nếu không thể auto test đáng tin, phase phải ghi rõ case trong `MANUAL-TEST-REQUIRED.md`; không được im lặng coi như đã PASS.

## Exit gate

Tất cả Live views dùng được, heavy collectors dừng khi không cần, không secret leak.

## Trạng thái ban đầu

```text
NOT STARTED
```
