# Phase 06 — Result

## Trạng thái

**IMPLEMENTED — chờ combined automated verification + Windows manual acceptance của Batch 06–09.**

## Đã làm

- 6 Live views dùng cùng normalized state: Overview / Performance / Processes / Tools / Resources / Usage.
- Current-session JSONL tailer bind theo `session_meta` của run hiện tại; mtime chỉ là prefilter, không phải evidence.
- Tools aggregate current-run only: current/last/recent/counts/errors.
- Resources metadata-only: Instructions/Skills/MCP/Rules/Permissions; không đọc body/secret.
- Performance RAM-only ring buffer + Codex/Monitor/System CPU-RAM + sparkline.
- Processes scope theo PID tree của Codex PTY, hot-process derived.
- Git branch/diff/ahead-behind tách collector; không network fetch.
- System + disk cached collector.
- Demand graph bật heavy collector chỉ khi active view cần.
- Alt+Left/Right chuyển configured Live view; ordinary prompt input vẫn forward cho Codex.

## Không làm

- Không persist performance/process history.
- Không pricing/cost.
- Không scan Resources khi view không demand.

## Exit gate còn lại

```powershell
.\scripts\phase6-9-verify.ps1
```

Sau auto PASS, nghiệm thu `MANUAL-TEST-REQUIRED.md` trên Windows Terminal.
