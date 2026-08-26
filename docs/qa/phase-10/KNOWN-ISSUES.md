# Phase 10 — Known Issues / Verification Caveats

Current checkpoint has no accepted P0 issue, but verification is still pending.

Known boundaries by design:

- analytics are derived only from persisted JSONL evidence;
- no historical CPU/RAM/process analytics;
- no pricing/cost estimate;
- no session deletion in Phase 10;
- resource history remains evidence-based and may legitimately be empty;
- token-per-turn uses cumulative deltas from the turn baseline, with rollout last-turn usage only as fallback;
- chart buffers are bounded; very long sessions resample/retain bounded history instead of unlimited RAM growth;
- selected-session initial deep load is chunked synchronous I/O, so an exceptionally large first-open JSONL can still have noticeable open latency even though LIVE updates are incremental.

Any discrepancy between analytics and the selected session Timeline should be treated as a correctness bug, not hidden by inferred data.
