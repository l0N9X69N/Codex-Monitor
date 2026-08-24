# Phase 02 — Known Issues / Deferred

## BLOCKER

Không có.

## P0

Không có P0 mở sau automated verification.

## Verification

`phase2-verify.ps1` đã PASS trên Windows / PowerShell với Node.js v24.19.0:

```text
Syntax:             41 files PASS
Full regression:    45 / 45 PASS
Focused Phase 02:   15 / 15 PASS
Fail/skip/cancel:   0 / 0 / 0
```

## DEFERRED

- PTY transient wording là heuristic phụ trợ; rollout/current-session evidence vẫn là nguồn bền vững hơn khi có.
- Session Health thresholds chưa chốt ở Phase 02.
- Full current-session file discovery/collector lifecycle sẽ được nối sâu hơn ở các phase collector/scheduler.
- History parser đầy đủ thuộc Phase 08.
- Renderer/UI không được đọc raw JSONL; Phase 02 đã cung cấp ingest pipeline + normalized state để các phase sau dùng.

Các mục deferred trên là scope của phase sau, không phải blocker của Phase 02.
