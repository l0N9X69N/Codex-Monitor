# Phase 11 — Known Issues

Status: **FINAL VERIFICATION PENDING**

No known delete-safety P0 is accepted for Phase 11 closure.

Intentional boundaries / non-blocking backlog:

- Storage color/palette polish is deferred to a later product UI pass.
- No automatic retention or background cleanup.
- No hidden backup before clear.
- LIVE and uncertain-active sessions remain non-deletable by design.
- If process telemetry is unavailable or ambiguous at confirmation time, deletion is conservatively rejected.
- Storage remains JSONL-backed in Phase 11; large-history indexing/performance evolution belongs to Phase 11-1 Local Session Archive.
- Linux/macOS release-quality verification remains separate platform backlog unless later release gates require it.

If final `verify:phase11` exposes a new failure, add it here only after diagnosis; do not mark Phase 11 complete around a failing safety gate.
