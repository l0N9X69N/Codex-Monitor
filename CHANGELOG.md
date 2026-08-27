# Changelog

## 1.0.0-alpha.1

Release-candidate development baseline for the v1 rearchitecture.

Highlights:

- passive Live HUD around the official Codex CLI;
- independent Session Manager with Operations/Table/Charts/Auto views;
- shared Config screen from Manager and `--configure`;
- first-run onboarding with explicit Save/Cancel semantics;
- deterministic Monitor CLI routing with exact `--` passthrough;
- optional Local Session Archive using built-in `node:sqlite`;
- missed-signal-safe Archive reconcile model using JSONL + committed offsets;
- Archive service/hook ownership boundaries and delete/storage safety;
- sanitized doctor/diagnostics and Monitor-owned repair;
- throttled GitHub Releases update checks with auto-install disabled;
- safe Monitor integration uninstall preserving Codex auth/sessions and Archive DB;
- Windows terminal key decoding hardening for Enter/Esc/Ctrl+C paths;
- Phase 13 package smoke, release artifact and SHA256 checksum tooling.

Known release-status caveats:

- real-machine Linux/macOS release validation is not inferred from Windows tests;
- signing/timestamping is environment/distribution dependent and must be recorded in the release checklist;
- final visual/performance polish remains subject to Phase 13 manual RC review.
