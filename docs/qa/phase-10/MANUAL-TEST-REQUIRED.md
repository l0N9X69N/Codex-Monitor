# Phase 10 — Manual Test Required

Status: **PENDING**

Run:

```powershell
npm run dev -- --manager
```

Manual gate:

1. Select a real **LIVE** session and press `Enter`.
2. `Info`: Context Stream uses real context evidence, current/peak values look plausible, compaction marker only appears when evidence exists.
3. `Tokens`: Cumulative Tokens and Token I/O / Turn update as the LIVE JSONL grows; Input/Cached/Uncached/Output/Reasoning are not fabricated.
4. `Turns`: recent turn rows show start time, duration, token/context/tool evidence; completed turn creates one duration point.
5. `Tools`: Tool Calls / Turn, tool share and recent event duration/failure evidence agree with Timeline.
6. `Errors`: retry/error/tool-failure/compaction stream agrees with Timeline evidence.
7. Inspect an **ENDED** session and confirm the same field semantics without live-only assumptions.
8. Resize narrow/normal/ultrawide; no wrap/overflow and charts fall back cleanly.
9. Leave Inspect and verify dashboard remains responsive and detail-only processing no longer drives visible updates.
10. Let a LIVE selected session grow for several turns and check that rows/charts append rather than duplicate.

Phase 10 must not be closed until this manual gate is accepted.
