# Phase 06 — Live Views & Lazy Collectors

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor Final Project Specification v1, design freeze 2026-08-24. Nếu tài liệu phase mâu thuẫn với `PROJECT-SPEC.md`, **PROJECT-SPEC.md thắng**.

## Mục tiêu

Hoàn thiện 6 Live views mà vẫn demand-driven.

## Phạm vi

- Tools current-run only: aggregate/current/last/sanitized detail/errors.
- Resources Instructions/Skills/MCP/Rules/Permissions metadata-only, lazy, không secret/body dump.
- Usage context/token/cache/reasoning/turn/compaction/Login quota/model provenance/freshness.
- Performance Codex/Monitor/system CPU-RAM + short RAM-only sparklines.
- Processes PID/PPID/name/command/CPU/RAM/age/tree/hot process.
- Git composite header với per-metric demand và không network fetch.
- System/disk lazy cached collectors.

## Invariants

- Không persist Performance/Processes vào History.
- Không pricing/cost.
- Không scan Resources khi không demand.
- Missing current-run evidence = `--`; không backfill History.

## Auto/manual gate

- Enter/leave heavy view bật/tắt collector đúng.
- Resources unused -> 0 scan; Processes inactive -> 0 poll.
- API Usage -> no 5H/WEEK; Tools -> current-run only; no secret leak.
- Windows manual: CPU/RAM/process tree/resources/tab navigation.

## Deliverables

`docs/qa/phase-06/` chứa `PHASE-06-RESULT.md`, `AUTO-TEST-REPORT.md`, `MANUAL-TEST-REQUIRED.md`, `KNOWN-ISSUES.md`.

## Trạng thái hiện tại

```text
IMPLEMENTED — WAITING BATCH 06-09 AUTOMATED VERIFICATION + WINDOWS MANUAL ACCEPTANCE
```

Batch command:

```powershell
.\scripts\phase6-9-verify.ps1
```
