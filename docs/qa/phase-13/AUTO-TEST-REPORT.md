# Phase 13 Auto Test Report

Status: **PENDING TARGET-MACHINE VERIFICATION**

Command:

```bash
npm run verify:phase13
```

The Phase 13 gate is designed to run:

- syntax verification;
- Phase 13 productization control tests;
- CLI routing including `--version`, `--diagnostics`, `--update`, `--uninstall` and exact `--` passthrough;
- updater fail-soft + approximately 24h throttle/disable semantics;
- diagnostics path/error redaction;
- safe uninstall ownership/preservation assertions;
- Archive Disabled zero-service-kick assertion;
- the complete Phase 12 verifier, which includes the full Phase 11-1 Archive/Manager regression gate;
- the full repository `node --test` suite;
- npm package smoke using `npm pack --dry-run` and forbidden-local-data checks.

Do not mark this report PASS until the target development machine runs the command successfully after the Phase 13 implementation head is finalized.

Manual release installation, visual approval, real-machine Archive lifecycle, performance measurements, Linux/macOS evidence and signing/timestamping are separate RC gates and are not implied by an automatic PASS.
