# Phase 08 — History Core Engine

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor Final Project Specification v1, design freeze 2026-08-24.

## Mục tiêu

Data engine cho `codexm --history`: local JSONL, RAM index, lazy parse, incremental live-tail, không DB.

## Implementation

- Session discovery/stat metadata-only.
- Lazy selected-session parse.
- RAM-only index/cache; không SQLite/CSV/history DB.
- Historical model Info/Tokens/Turns/Tools/Resources/Errors.
- `official-history` provenance tách khỏi Live current-run.
- Incremental tail theo byte offset, partial append/no duplicate, truncate reload.
- Resources evidence-only; không scan filesystem hiện tại để bịa session cũ.
- Missing = `--`; không cost/pricing.
- `--history` Monitor-owned và không spawn Codex.

## Auto/manual gate

- 1000+ fake sessions không deep parse startup.
- partial/complete append, truncate/rotation, no DB.
- real large session folder + live-tail manual.

## Deliverables

`docs/qa/phase-08/` chứa đủ 4 handoff files.

## Trạng thái hiện tại

```text
IMPLEMENTED — WAITING BATCH 06-09 AUTOMATED VERIFICATION + WINDOWS HISTORY DATA ACCEPTANCE
```

```powershell
.\scripts\phase6-9-verify.ps1
```
