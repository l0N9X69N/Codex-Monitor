# Phase 13 Performance Baseline

Status: **TARGET-MACHINE MEASUREMENTS PENDING**

Do not freeze arbitrary release thresholds before measurement. Record values on the target machine and compare against visible Codex usability and existing regression/stress tests.

## Environment

```text
OS:
Terminal:
Node:
CPU:
RAM:
Codex CLI:
Codex Monitor commit:
```

## Measurements

| Scenario | Result | Notes |
| --- | ---: | --- |
| Live input latency — Archive OFF | pending | Must feel indistinguishable from official Codex interaction |
| Live input latency — Archive ON | pending | Archive must not sit on stdin critical path |
| Archive Service idle CPU | pending | Should be effectively sleeping |
| Archive Service idle RAM | pending | Record working set / RSS |
| Archive Service active CPU/RAM | pending | During reconcile/backfill |
| Incremental append -> indexed latency | pending | Normal active session |
| Manager cold open / first render | pending | Archive enabled and disabled |
| Manager search/filter latency | pending | Large session set |
| Huge unindexed JSONL backfill | pending | Manager must remain usable |
| Multiple simultaneous LIVE files | pending | Record responsiveness/fairness |
| SQLite DB growth/session | pending | Representative fixture |
| Compact Archive cost | pending | Duration + UI/product impact |

Existing Phase 9/11/11-1 stress/performance tests are automatic regression evidence. This sheet records the release-machine baseline required by Phase 13.
