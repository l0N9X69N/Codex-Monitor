# Phase 13 Known Issues / Release Limitations

Status: **OPEN RC REVIEW**

These items are not silently treated as PASS:

- Linux real-machine release validation: **UNVERIFIED PLATFORM**.
- macOS real-machine release validation: **UNVERIFIED PLATFORM**.
- Code/package signing and timestamping depend on the eventual distribution environment and are not established by source-runtime tests.
- A GitHub `latest release` endpoint may be unavailable before a release is actually published; the updater is intentionally fail-soft in that state.
- `codexm --uninstall` removes Monitor-owned integration only; package-manager removal remains an explicit npm step by design.
- Final visual/copy/density preferences are subject to the user-driven Phase 13 polish pass after automatic verification.
- Final target-machine performance numbers are pending the RC measurement pass; existing performance/stress suites remain regression evidence but are not a substitute for the recorded release baseline.
- Linux/macOS Archive hook/service/watch/install behavior must not be advertised as release-verified until real evidence exists.

The following are **not deferrable** if discovered during RC testing: Codex input regressions, terminal restore failure, data loss, unsafe delete/uninstall scope, privacy/secret leakage, Archive committed-offset correctness bugs, missed-data recovery failures, or Archive failure blocking Live/Codex.
