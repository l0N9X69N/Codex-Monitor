# Phase 12 Auto Test Report

Status: **PENDING RERUN ON LATEST 12D CLOSE-CANDIDATE HEAD**

Command:

```bash
npm run verify:phase12
```

The latest Phase 12 gate includes:

- syntax verification;
- deterministic Monitor CLI routing and exact Codex passthrough tests;
- config schema/migration/setup-state tests;
- first-run onboarding state-machine and non-TTY tests;
- shared Config persistence, Save/Revert/Cancel and reset-safety tests;
- production Live/Manager preview tests;
- malformed/future config recovery and atomic-save failure preservation tests;
- Manager-host Config preview integration tests;
- sanitized Archive doctor output tests;
- Monitor-owned Archive repair boundary tests;
- full Phase 11-1 Archive/Manager auto verifier;
- Manager runtime/input regressions from Phase 9/11.

Earlier Phase 12 checkpoints 12A, 12B and 12C were run by the target-machine developer and reported PASS. Those results do **not** substitute for rerunning the latest 12D close-candidate gate because 12D added Manager-host preview and Doctor/Repair control-plane changes.

Do not mark Phase 12 AUTO VERIFIED until the latest command above completes successfully.
