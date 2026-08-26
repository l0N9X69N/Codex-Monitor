# Phase 08 — Known Issues / Deferred

## BLOCKER

**None. P0 = 0 at Phase 08 close.**

## Resolved during Phase 08

### Windows active-session misclassification

Initial real Windows acceptance incorrectly produced mass ENDED states while Codex terminals were active. Root cause was treating a successful global process query as negative evidence for every session whose thread id was absent from process command lines.

Resolved by:

- explicit Codex process-family detection;
- one-to-one nearest process-start/session-start correlation;
- exact thread evidence when available;
- sticky session↔root association across polls;
- session-specific negative evidence only after a previously mapped root disappears;
- conservative UNKNOWN for active-but-unmapped Codex evidence;
- lightweight Windows process collection independent of expensive per-process perf counters.

Real Windows retest passed with multi-LIVE, close-one transition and dynamic new-session discovery/remap.

### Manager one-shot runtime

Resolved by persistent renderer-neutral `SessionManagerRuntime` using `SessionManagerTracker`; CLI Manager remains alive until stop and emits snapshots when state/diagnostics change.

### Large-tree runtime I/O

Resolved by bounded identity probing, no repeated unchanged failed probes, bounded fast refresh set, slower full discovery cadence, and selected-only deep parsing. Deterministic 1000+ session instrumentation is part of `verify:phase8`.

## Deferred by roadmap

- Interactive Session Manager dashboard/TUI: Phase 09.
- Charts: Phase 10.
- Delete/archive/storage mutation: Phase 11.
- No History database is introduced.
