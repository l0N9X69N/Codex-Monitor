# Security

## Scope

Codex Monitor is a local-first wrapper around the official Codex CLI. It must not weaken Codex authentication, execute transcript content as code, or silently expand destructive scope.

## Security boundaries

- Official Codex auth and session storage remain Codex-owned.
- Local Session Archive is Monitor-owned, local-only and Disabled by default.
- Archive hook/service actions operate only on Monitor-owned handlers identified by the Codex Monitor marker.
- `--repair` and `--uninstall` must not remove unrelated Codex hooks/plugins.
- Reset/uninstall must not delete Codex auth, Codex sessions, or Archive SQLite data without a separate explicit destructive product flow.
- Session/source paths are treated as data and must be validated before destructive operations.
- JSONL content is parsed as data and never evaluated/executed.

## Diagnostics

Doctor/diagnostics output is intentionally sanitized. It may report versions, platform, TTY capability, Archive health categories and queue counts. It must not dump prompts, assistant responses, full tool output, API keys, login tokens, raw transcripts or filesystem paths from arbitrary runtime errors.

## Local permissions

Monitor-owned config/data directories are created with owner-oriented permissions where the platform supports POSIX modes. Archive SQLite files are normalized to owner read/write where possible.

## Network behavior

Live monitoring, Manager and Local Session Archive perform no telemetry upload. The only release-network feature is the optional update checker, which requests GitHub Releases metadata and never uploads prompts, project data, tokens, session content or Archive content. Auto-install is disabled.

## Reporting

Do not include secrets or private session transcripts in a vulnerability report. Provide a minimal reproduction and affected version/commit where possible.
