# Changelog

## 1.0.0-alpha.1

Public v1 release-candidate baseline.

Highlights:

- passive Live Monitor around the official Codex CLI;
- transparent `codexm` passthrough: official Codex owns all short/long arguments and interactive stdin;
- independent `codexmm` Session Manager with Operations, Table, Charts and Auto views;
- shared `codexmc` configuration and first-run onboarding;
- localized Monitor help through `codexmh` and contextual command help;
- responsive Live HUD with Recommended, Compact, Full and Custom presets;
- optional local System CPU/RAM telemetry;
- optional Local Session Archive using built-in `node:sqlite`;
- missed-signal-safe Archive reconciliation using Codex JSONL + committed offsets;
- Monitor-owned Archive hook/service repair without bypassing official Codex hook trust;
- storage/delete safety preserving Codex-owned auth and session data;
- sanitized local diagnostics through `codexmctl doctor`;
- throttled GitHub release update checks with automatic installation disabled;
- external Windows installer/uninstaller with conservative Node/npm ownership rules;
- five-command CLI family: `codexm`, `codexmm`, `codexmc`, `codexmh`, `codexmctl`;
- Phase 13 package smoke and full repository regression verification.

Current release notes:

- Windows PowerShell is the documented installation path for this release candidate;
- official Codex is a separate dependency and is never installed or modified by Codex Monitor;
- Archive is optional, local-only and disabled by default;
- signing/timestamping and wider real-machine platform validation remain distribution/release tasks.
