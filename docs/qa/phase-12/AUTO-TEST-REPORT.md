# Phase 12 Auto Test Report

Status: **REVERIFY REQUIRED — POST-PASS WINDOWS TTY INPUT FIX LANDED**

Recorded prior PASS: **2026-08-27**

Command:

```bash
npm run verify:phase12
```

The target-machine developer previously reported **PASS, all checks green** for source-runtime head:

```text
a97970f94eafb3b8d16b92eb1d2ab597c7dcdf2d
```

During the subsequent manual Windows Terminal closeout, real-console Enter/Esc handling exposed a blocker that fake-TTY tests had not caught. Portable key decoding was then added for onboarding, standalone Config, reset confirmation and Manager; Manager was routed through a decoded-input host. Manual retest confirmed Manager Enter/Esc behavior is now working on the target Windows Terminal.

Current implementation head requiring re-verification:

```text
a70f332dec448dbac34b8714908549da974ee8ab
```

The Phase 12 gate includes:

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

Do not treat Phase 12 as AUTO VERIFIED on the new input-fix head until `npm run verify:phase12` passes again. Manual Windows input validation is positive for the reported Enter/Esc blocker, but broader manual closeout remains pending.
