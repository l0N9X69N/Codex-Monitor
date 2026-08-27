# Phase 11-1 — Manual Test Required

Status: **REQUIRED BEFORE CLOSE**

Run first on disposable/temp sessions. Do not use important real Codex history for destructive checks.

Required Windows verification:

- Enable Archive from Manager `C → Archive`; verify DB creation/migration, Monitor-owned hook install and service wake/start.
- Disable Archive; verify service stops, Monitor-owned hook is removed/disabled, SQLite archive remains.
- Re-enable Archive; verify new/changed raw JSONLs reconcile without rebuilding already committed bytes.
- Run Codex while Manager is closed; open Manager after the session and verify SQLite-first history is already available.
- Kill Archive Service during an active session; verify Codex remains unaffected and the next wake/restart catches up from the committed offset.
- Simulate missed hook/watcher activity by changing a source while no signal is delivered; verify startup/safety reconcile catches it.
- Verify a LIVE JSONL alternates READY-at-high-water ↔ CATCHING_UP while appending without double-count after SQLite commits.
- Delete raw only and verify archived analytics remain as ARCHIVED.
- Delete archive only and verify raw JSONL remains untouched and is intentionally suppressed from immediate reindex until product/user action changes that state.
- Delete Everything and force one raw unlink failure; verify archive is not deleted for that failed raw row and partial failure is reported honestly.
- Clear Archive and verify raw `~/.codex/sessions` files are unchanged.
- Compact Archive only while service is idle/stopped; verify failure is explicit if service is running.
- Force/observe a failed ingest; verify Archive Config shows `Failed files > 0` and `ATTENTION`, then verify successful reconcile clears it.
- Exercise Config Save/Revert/Esc and verify Manager hot-applies Archive OFF/ON without requiring process restart.

Performance/manual observation:

- Compare codexm Live input/render responsiveness with Archive disabled vs enabled during active writes.
- Observe idle Archive Service CPU/disk after idle grace; target effectively sleeping/zero write I/O.
- Exercise 1,000+ archived rows and, where fixtures permit, 10,000 rows; record Manager first-render/search/detail latency.
- Exercise one very large UNINDEXED source alongside a small active indexed delta; verify active delta remains responsive.
- Observe Manager raw-summary I/O for archive-authoritative LIVE rows; this remains a known optimization candidate and must not regress visible latency.

Cross-platform policy:

- Windows: explicit manual verification required for Phase 11-1 closure.
- Linux/macOS: keep verification status explicit until exercised on those platforms; do not claim native verification from Windows-only QA.

Network/privacy spot check:

- Archive Service must open no network listener/request.
- Inspect SQLite rows for representative sessions and verify no raw prompt, assistant response, full shell stdout, full tool response, file contents or terminal transcript are persisted by default.
