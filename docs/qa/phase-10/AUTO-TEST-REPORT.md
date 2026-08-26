# Phase 10 — Auto Test Report

Status: **PENDING LOCAL VERIFICATION**

Commands:

```powershell
npm run test:phase10
npm run verify:phase10
```

Automated coverage added for:

- context series, peak and compaction marker;
- cumulative token breakdown including uncached input;
- token I/O per turn;
- turn duration and per-turn tool count;
- tool share/event duration/failure evidence;
- LIVE selected-session incremental tail with no duplicate on unchanged tail;
- malformed/missing evidence safe degradation;
- bounded long-session turn ring semantics;
- responsive Inspect rendering and Phase 09 interaction regressions.

Do not mark PASS until the commands above are executed successfully in the target environment.
