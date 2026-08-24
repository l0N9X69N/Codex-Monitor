# Changelog

## 1.0.0 - 2026-08-24

- Implemented the final four-profile command architecture.
- Made `codexm` default to Full + Login (`codexm-f-l`).
- Added the full four-column table renderer: Context, Usage, Session, Current Activity.
- Added automatic full-to-lite fallback for small terminals.
- Added deterministic Login/API child profiles using Codex `forced_login_method`.
- Added API-key child environment handling without printing secret values.
- Preserved the scroll-safe ConPTY wrapper and live session discovery.
- Preserved 5h/week quota, context, token, cache, reasoning, duration, and Git metrics.
- Added richer tool/activity detail to rollout state.
- Preserved PTY approval/error detection and fixed stale approval resurrection.
- Persist transient error counts in the dashboard after the red state clears.
- Expanded demo mode to the full renderer and all four profiles.
- Reworked installation to use a standalone npm tarball instead of a source-tree link.
- Added PowerShell uninstall script and expanded tests.
