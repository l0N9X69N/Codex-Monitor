# Phase 11-1 — Known Issues

Status: **FINAL CANDIDATE — no known correctness blocker from automated review; manual/performance gates remain**

## Open / accepted for final-candidate QA

### 1. Redundant lightweight raw-summary I/O for some archive-authoritative Manager rows

`SessionManagerTracker` still bootstraps/tails lightweight raw summaries for hot/recent sessions before the production archive-authoritative merge discards those raw telemetry totals for READY/CATCHING_UP archive rows.

Impact:

- Correctness: none expected; canonical SQLite + committed-offset overlay still owns archive-authoritative telemetry.
- Performance: avoidable JSONL reads remain, especially for active archive-backed rows.
- Closure rule: benchmark on target hardware. If visible Manager/Live latency or disk I/O is material, filter summary bootstrap/tail for authoritative archive-backed paths before close.

### 2. Extreme single JSONL records above the hard archive record limit are deliberately discarded for forward progress

The bounded reader/normalizer records parse-error evidence and continues rather than retaining an arbitrarily large payload in memory.

Impact:

- Archive may omit analytics contained only inside an extreme oversized record.
- Raw Codex JSONL remains authoritative while present.
- The behavior is fail-soft and covered by progress tests, but should be treated as a documented data-fidelity limit rather than silent success.

### 3. `Compact Archive` uses full `VACUUM`

It is guarded so it does not run while Archive Service is reported running, but full VACUUM can still be expensive on a large archive and can require temporary disk space.

Impact:

- Not on Codex PTY/Live critical path.
- User-triggered maintenance may take noticeable time.
- Manual large-DB behavior should be observed before declaring performance closure.

### 4. Cross-platform native verification is not implied by unit tests

Platform abstractions and regressions are automated, but real hook/service/filesystem behavior still needs explicit native verification.

- Windows: required before Phase 11-1 close.
- Linux/macOS: retain explicit unverified/verified status according to project policy.

## Resolved during implementation

- SQLite-first Manager first render no longer waits for full JSONL parsing.
- READY requires verified source coverage and is downgraded on raw growth/incomplete scans.
- Stale service metadata no longer proves process liveness.
- SQLite detail no longer loses cached/reasoning per-turn fidelity for newly indexed data.
- Failed ingest now has an explicit derived failed-file health count and prevents false READY.
- Transient SQLite BUSY/LOCKED commits have bounded retry at the reconcile boundary.
- Historical backfill no longer takes initial priority over an already-indexed append delta.
- Archive-only deletion no longer immediately resurrects the same raw source into archive work; suppression semantics are persisted.
- Delete Everything keeps raw-first safety and reports partial failure without fake full success.
