# Phase 11-1 — Auto Test Report

Status: **PASS — target-machine auto verification recorded 2026-08-27**

Primary commands:

```text
npm run test:phase11-1
npm run verify:phase11-1
```

Recorded closure evidence:

```text
npm run verify:phase11-1  PASS
```

The Phase 11-1 verifier includes syntax, platform/data-directory regressions, archive foundation/database/repository/fidelity/maintenance/resilience/coordinator/service/config/hooks/oversized-record tests, Manager config/index/health/service-liveness/dynamic-config/detail/live-overlay tests, and the Phase 11 storage/delete/input safety regression batch.

Automated evidence covers:

- Archive opt-in defaults and Node `node:sqlite` runtime baseline.
- WAL/NORMAL/foreign-key/busy-timeout database setup and additive schema migrations.
- Incremental committed-offset ingestion, partial-line handling, truncation/replacement detection and atomic derived-state/checkpoint commits.
- Oversized-record bounded progress and parse-error isolation.
- Hook fail-soft signaling, service lazy lifecycle, idle shutdown, stop targeting, watcher/safety reconcile recovery and stale service lock/liveness handling.
- Bounded source/cycle byte budgets with event-loop yielding.
- Fair queue rotation plus priority for already-indexed append deltas over historical UNINDEXED backfill.
- Bounded `SQLITE_BUSY`/`SQLITE_LOCKED` retry at the reconcile commit boundary.
- Derived `failedFileCount`; failed ingest prevents false READY and Archive Config reports ATTENTION.
- SQLite-first Manager startup, verified source-scan semantics and READY/CATCHING_UP/UNINDEXED/STALE/ARCHIVED states.
- SQLite base + committed-offset JSONL live overlay with rebase/no-double-count behavior.
- SQLite detail fidelity for cumulative token samples, per-turn cached/reasoning tokens and technical tool grouping without persisted command/output payloads.
- Archive Config health/actions, shared config engine and hot OFF/ON Manager archive transitions.
- Archive-only deletion, persistent suppression of intentionally removed archive data, Clear Archive, raw-preserving delete, and raw-first Delete Everything partial-failure semantics.
- Phase 11 raw deletion protections and terminal/storage regressions remain in the verification gate.

Automated verification is complete. Native lifecycle/performance/privacy observations remain tracked separately in `MANUAL-TEST-REQUIRED.md` and are not implied by this PASS.
