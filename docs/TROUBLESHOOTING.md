# Troubleshooting

## Doctor

Run:

```text
codexmctl doctor
```

or:

```text
codexmctl diagnostics
```

Expected output includes Node/platform, official Codex path, auth mode/source, TTY availability and sanitized Archive health. It must not dump prompts, responses, tool output or raw transcripts.

## Repair

Run:

```text
codexmctl repair
```

If Archive is Disabled, repair is a no-op. If enabled, repair is limited to Monitor-owned hook/service integration and reconcile wake-up.

## Archive shows ATTENTION / SQLite unavailable

Archive failures are fail-soft and must not sit on the Codex stdin/PTY critical path. Use `codexmctl repair` for Monitor-owned integration issues; do not delete the Archive database as a generic repair step.

## Input / terminal stuck

Interactive Monitor TUI surfaces use portable key decoding and terminal guards. If a regression leaves a terminal in a bad state, terminate the affected Monitor process and open a fresh terminal, then capture the exact terminal/OS/Node version and key sequence for reproduction.

## Codex arguments

`codexm` is transparent: all flags and arguments belong to official Codex. There is no Monitor flag namespace inside `codexm`.

## Update check failure

`codexmctl update` is fail-soft. A network/GitHub failure does not block Codex Monitor and does not install anything.

## Safe uninstall

Use the external root GitHub uninstaller:

```powershell
irm https://raw.githubusercontent.com/l0N9X69N/Codex-Monitor/v1-rearchitecture/uninstall.ps1 | iex
```

There is intentionally no CLI uninstall command. The uninstaller removes only Monitor-owned integration/package/link/shims/source. It preserves Node.js, npm, official Codex, Codex auth/sessions, Monitor config and Archive SQLite.
