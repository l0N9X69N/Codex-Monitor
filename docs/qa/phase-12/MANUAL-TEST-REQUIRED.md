# Phase 12 Manual Test Required

Status: **PASS — FOCUSED WINDOWS SOURCE-RUNTIME UX CLOSEOUT COMPLETE**

Recorded: **2026-08-27**

This Phase 12 gate covers the repository/source runtime only. It does not claim a globally installed `codexm`, packaging/signing, native service installation, or release artifacts.

## Manual evidence recorded

The target-machine developer exercised the Phase 12 interactive paths in Windows Terminal / PowerShell and approved the focused closeout.

Observed functional evidence includes:

- clean first-run onboarding opened before Codex and the real-console Enter/Esc path was exercised;
- a Windows TTY blocker was found during manual testing, fixed with portable key decoding, and re-tested successfully;
- Session Manager real-console Enter/Esc behavior was confirmed after the fix;
- Manager shared Config remained reachable and preview/navigation input continued to work after the input fix;
- `npm run verify:phase12` was re-run after the TTY fix and reported PASS on implementation head `245b49f740f2e238654abd690d8905f6a27fc817`;
- standalone Config / Reset were included in the final focused manual closeout with no new blocker reported;
- `node ./src/cli/codexm.js --doctor` reported local/sanitized state without transcript/prompt/tool-output/secrets and honestly represented Archive as Disabled with unavailable SQLite health;
- `node ./src/cli/codexm.js --repair` while Archive was Disabled returned a safe no-op: `Archive: Disabled; no Monitor-owned hook/service repair was needed.`;
- no destructive Codex auth/session/archive-data action was observed during the closeout.

## Close decision

Phase 12 blocking functional/manual gate is accepted with:

- **BLOCKER = 0**
- **P0 = 0**

The following remain intentionally outside this close decision and continue into Phase 13/final cross-phase review:

- broad visual/copy/localization polish;
- exhaustive narrow/normal/wide terminal visual review;
- packaging/install/PATH/signing/update/uninstall productization;
- real-machine Linux/macOS validation beyond existing adapter/unit coverage;
- final Phase 11-1/12 cross-phase Archive/service/performance review.

If a later Phase 13 test exposes a correctness, data-loss, privacy, destructive-safety, or terminal-restoration regression, reopen the owning phase rather than treating this closeout as a waiver.
