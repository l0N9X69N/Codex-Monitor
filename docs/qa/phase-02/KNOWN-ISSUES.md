# Phase 02 — Known Issues / Deferred

## BLOCKER

Chưa biết cho đến khi `phase2-verify.ps1` được chạy trên working tree mới nhất.

## P0

Chưa có P0 đã biết trong code Phase 02.

## DEFERRED

- PTY transient wording là heuristic phụ trợ; rollout/current-session evidence vẫn là nguồn bền vững hơn khi có.
- Session Health thresholds chưa chốt ở Phase 02.
- Full current-session file discovery/collector lifecycle sẽ được nối sâu hơn ở các phase collector/scheduler.
- History parser đầy đủ thuộc Phase 08.
- Renderer/UI không được đọc raw JSONL; Phase 02 đã cung cấp ingest pipeline + normalized state để các phase sau dùng.
