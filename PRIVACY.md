# Privacy

Codex Monitor is designed as a local-first terminal product.

## Data that stays local

The Monitor reads local Codex runtime/session information needed to render the Live HUD and Session Manager. The optional Local Session Archive stores technical analytics metadata in a local SQLite database.

Codex Monitor does not intentionally upload prompts, assistant responses, tool output, session transcripts, project contents, API keys, login tokens or Archive data.

## Local Session Archive

Archive is Disabled by default and requires explicit opt-in.

- Codex JSONL remains the Codex-owned raw source.
- Archive SQLite is Monitor-owned technical analytics storage.
- Archive may preserve analytics for an ARCHIVED session after the raw JSONL is no longer present.
- Disabling Archive stops Monitor-owned background integration but keeps the database.
- Reset does not delete the database.
- `codexm --uninstall` preserves the database.
- Clear/Delete Archive operations are separate destructive actions and must be explicitly requested.

Archive hooks are wake-up signals. The hook payload is not used as a default transcript persistence channel.

## Diagnostics

`--doctor` / `--diagnostics` reports sanitized local health only. It must not print transcript content or secrets.

## Update checks

If update checks are enabled, Codex Monitor may request release metadata from GitHub Releases no more often than approximately once per 24 hours. The request contains normal HTTP metadata and a Codex Monitor user-agent; no Monitor config, project data, tokens, session content or Archive content is sent.

Auto-install is Disabled.
