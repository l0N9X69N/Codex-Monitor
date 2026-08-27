# Troubleshooting

## Doctor

Run:

```text
codexm --doctor
```

or:

```text
codexm --diagnostics
```

Expected output includes Node/platform, official Codex path, auth mode/source, TTY availability and sanitized Archive health. It must not dump prompts, responses, tool output, tokens or raw transcripts.

## Repair

Run:

```text
codexm --repair
```

If Archive is Disabled, repair is a no-op. If enabled, repair is limited to Monitor-owned hook/service integration and reconcile wake-up. It never deletes Archive SQLite or modifies official Codex binaries/auth/sessions.

## Archive shows ATTENTION / SQLite unavailable

The Live Monitor and Codex should remain usable. Archive failures are fail-soft and must not sit on the Codex stdin/PTY critical path.

Typical categories include:

- database unavailable;
- database busy;
- permission denied;
- hook integration unavailable;
- archive service unavailable.

Use `--repair` for Monitor-owned integration issues. Do not delete the Archive database as a generic repair step.

## Input / terminal stuck

Interactive Monitor TUI surfaces use portable key decoding and terminal guards. If a regression leaves a terminal in a bad state, terminate the affected Monitor process and open a fresh terminal, then capture the exact terminal/OS/Node version and key sequence for reproduction.

## Exact Codex arguments

If a Monitor flag name collides with a Codex flag, use the passthrough boundary:

```text
codexm -- --version
```

Everything after `--` belongs to official Codex.

## Update check failure

`codexm --update` is fail-soft. A network/GitHub failure does not block Codex Monitor and does not install anything.

## Safe uninstall

Run `codexm --uninstall` first to remove Monitor-owned Archive integration, then remove the package/link through npm. Codex auth, Codex sessions, Monitor config and Archive SQLite are preserved.
